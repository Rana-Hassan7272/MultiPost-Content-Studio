import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type Payload = {
  mode: "single" | "due";
  campaignId?: string;
  resendFailedOnly?: boolean;
  /** When true (cron/scheduler), process due campaigns for all users. */
  global?: boolean;
};

/** Resend returns JSON like { message: "..." }; keep a short plain string for logs. */
function parseResendErrorBody(body: string): string {
  const t = body.trim();
  try {
    const j = JSON.parse(t) as { message?: string };
    if (typeof j?.message === "string") return j.message;
  } catch {
    /* ignore */
  }
  return t.length > 800 ? `${t.slice(0, 800)}…` : t;
}

/** User-actionable hint when Resend rejects due to onboarding / unverified domain. */
function resendDeliveryHint(message: string): string | null {
  const m = message.toLowerCase();
  if (
    m.includes("testing domain") ||
    m.includes("resend.dev") ||
    m.includes("only send to your own") ||
    m.includes("verify a domain")
  ) {
    return (
      "Resend's test address (e.g. onboarding@resend.dev) only delivers to the inbox of the email on your Resend account. " +
      "To send to any recipient, verify a domain in Resend and set EMAIL_FROM to an address on that domain. " +
      "Check EMAIL_FROM has no accidental line breaks in Supabase secrets."
    );
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
    const emailFrom = (Deno.env.get("EMAIL_FROM") ?? "").trim();

    const admin = createClient(supabaseUrl, serviceRole);
    const body = (await req.json()) as Payload;
    const nowIso = new Date().toISOString();
    const globalMode = body.global === true;
    let userId: string | null = null;

    // For user-triggered sends (single mode, or due mode without `global:true`),
    // require a valid Supabase session JWT.
    // For cron-triggered due processing (`global:true`), skip auth and process all users.
    if (body.mode === "single" || (body.mode === "due" && !globalMode)) {
      const authHeader = req.headers.get("Authorization") || "";
      const client = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
        error: authError,
      } = await client.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
    }

    let campaigns: any[] = [];
    if (body.mode === "single" && body.campaignId) {
      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data } = await admin
        .from("email_campaigns")
        .select("*")
        .eq("id", body.campaignId)
        .eq("user_id", userId)
        .limit(1);
      campaigns = data || [];
    } else if (body.mode === "due") {
      // Only auto-send campaigns that are explicitly scheduled and due.
      // Do not include drafts here — otherwise every draft would send on each tick.
      if (globalMode) {
        const { data, error: dueErr } = await admin
          .from("email_campaigns")
          .select("*")
          .eq("status", "scheduled")
          .lte("scheduled_at", nowIso);
        if (dueErr) throw dueErr;
        campaigns = data || [];
      } else {
        if (!userId) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data, error: dueErr } = await admin
          .from("email_campaigns")
          .select("*")
          .eq("user_id", userId)
          .eq("status", "scheduled")
          .lte("scheduled_at", nowIso);
        if (dueErr) throw dueErr;
        campaigns = data || [];
      }
    }

    let totalSentCount = 0;
    let totalFailedCount = 0;
    let responseHint: string | null = null;
    const providerMode = resendKey && emailFrom ? "resend" : "mock";
    if (!resendKey || !emailFrom) {
      responseHint =
        "Email provider is not configured. Please set `RESEND_API_KEY` and `EMAIL_FROM` in Supabase Edge Function secrets. No emails were sent.";
    }

    for (const campaign of campaigns) {
      const campaignUserId = campaign.user_id as string;
      const { data: memberships } = await admin
        .from("email_list_contacts")
        .select("contact_id,email_contacts(email,full_name,status)")
        .eq("user_id", campaignUserId)
        .eq("list_id", campaign.list_id);

      const recipients = (memberships || [])
        .map((m: any) => ({
          contact_id: m.contact_id,
          email: m.email_contacts?.email as string,
          full_name: m.email_contacts?.full_name as string | null,
          status: m.email_contacts?.status as string,
        }))
        .filter((r) => r.email && r.status === "subscribed");

      let recipientsToSend = recipients;
      if (body.resendFailedOnly) {
        const { data: existingRecipients } = await admin
          .from("email_campaign_recipients")
          .select("contact_id,status")
          .eq("campaign_id", campaign.id)
          .eq("user_id", campaignUserId);

        const failedContactIds = new Set(
          (existingRecipients || [])
            .filter((r: any) => r.status === "failed")
            .map((r: any) => r.contact_id),
        );
        recipientsToSend = recipients.filter((r) => failedContactIds.has(r.contact_id));
      }

      await admin
        .from("email_campaigns")
        .update({
          status: "sending",
          total_recipients: recipientsToSend.length,
          sent_at: nowIso,
        })
        .eq("id", campaign.id)
        .eq("user_id", campaignUserId);

      if (recipientsToSend.length === 0) {
        await admin
          .from("email_campaigns")
          .update({
            status: "sent",
            total_recipients: 0,
            sent_at: nowIso,
          })
          .eq("id", campaign.id)
          .eq("user_id", campaignUserId);
        continue;
      }

      for (const recipient of recipientsToSend) {
        const { data: recRow } = await admin
          .from("email_campaign_recipients")
          .upsert(
            {
              user_id: campaignUserId,
              campaign_id: campaign.id,
              contact_id: recipient.contact_id,
              email: recipient.email,
              status: "pending",
            },
            { onConflict: "campaign_id,contact_id" },
          )
          .select("id")
          .single();

        let sent = false;
        let failureReason = "";
        let providerMessageId: string | null = null;
        if (resendKey && emailFrom) {
          const payload = JSON.stringify({
            from: emailFrom,
            to: [recipient.email],
            subject: campaign.subject,
            html: campaign.content_html,
            // Tags allow webhooks to map events back to the exact campaign/contact.
            tags: {
              campaign_id: String(campaign.id),
              contact_id: String(recipient.contact_id),
            },
          });
          let lastText = "";
          for (let attempt = 0; attempt < 3; attempt++) {
            const sendRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${resendKey}`,
              },
              body: payload,
            });

            lastText = await sendRes.text();
            if (sendRes.ok) {
              sent = true;
              const sendJson = (() => {
                try {
                  return JSON.parse(lastText) as { id?: string };
                } catch {
                  return null;
                }
              })();
              providerMessageId = sendJson?.id ? String(sendJson.id) : null;
              break;
            }

            // Retry rate-limit / transient errors.
            if (sendRes.status === 429 || sendRes.status === 503) {
              await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
              continue;
            }

            failureReason = parseResendErrorBody(lastText);
            break;
          }

          if (!sent && !failureReason) failureReason = parseResendErrorBody(lastText);
          if (!sent && failureReason && !responseHint) {
            responseHint = resendDeliveryHint(failureReason);
          }
        } else {
          // In production we should not silently pretend success.
          sent = false;
          failureReason =
            responseHint ??
            "Email provider is not configured. Please set `RESEND_API_KEY` and `EMAIL_FROM` in Supabase Edge Function secrets.";
        }

        if (sent) {
          await admin
            .from("email_campaign_recipients")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              ...(providerMessageId ? { provider_message_id: providerMessageId } : {}),
            })
            .eq("campaign_id", campaign.id)
            .eq("contact_id", recipient.contact_id)
            .eq("user_id", campaignUserId);
          await admin.from("email_events").insert({
            user_id: campaignUserId,
            campaign_id: campaign.id,
            recipient_id: recRow?.id || null,
            event_type: "sent",
            event_payload: { email: recipient.email, provider_message_id: providerMessageId },
          });
        } else {
          await admin
            .from("email_campaign_recipients")
            .update({ status: "failed" })
            .eq("campaign_id", campaign.id)
            .eq("contact_id", recipient.contact_id)
            .eq("user_id", campaignUserId);
          await admin.from("email_events").insert({
            user_id: campaignUserId,
            campaign_id: campaign.id,
            recipient_id: recRow?.id || null,
            event_type: "failed",
            event_payload: { email: recipient.email, reason: failureReason, provider_message_id: providerMessageId },
          });
        }
      }

      const { data: summary } = await admin
        .from("email_campaign_recipients")
        .select("status")
        .eq("campaign_id", campaign.id)
        .eq("user_id", campaignUserId);

      const statuses = summary || [];
      const sentCount = statuses.filter((s) => s.status === "sent").length;
      const failedCount = statuses.filter((s) => s.status === "failed").length;
      totalSentCount += sentCount;
      totalFailedCount += failedCount;
      await admin
        .from("email_campaigns")
        .update({
          status: failedCount > 0 && sentCount === 0 ? "failed" : "sent",
        })
        .eq("id", campaign.id)
        .eq("user_id", campaignUserId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: campaigns.length,
        provider_mode: providerMode,
        sent_count: totalSentCount,
        failed_count: totalFailedCount,
        ...(responseHint ? { hint: responseHint } : {}),
      }),
      {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("email-campaign-dispatch error", error);
    return new Response(JSON.stringify({ error: (error as Error).message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
