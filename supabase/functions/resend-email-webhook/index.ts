import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function extractSignatureCandidates(svixSignature: string): string[] {
  const rawParts = svixSignature.split(",").map((p) => p.trim()).filter(Boolean);
  if (rawParts.length === 2 && rawParts[0] === "v1") return [rawParts[1]];
  return rawParts
    .map((p) => {
      const idx = p.indexOf("=");
      return idx >= 0 ? p.slice(idx + 1) : p;
    })
    .filter(Boolean);
}

async function verifySvixSignature(args: {
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
  webhookSecret: string;
  rawBody: string;
}): Promise<boolean> {
  const { svixId, svixTimestamp, svixSignature, webhookSecret, rawBody } = args;
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Svix timestamps are seconds since epoch.
  const tsMs = Number(svixTimestamp) * 1000;
  if (!Number.isFinite(tsMs)) return false;
  const ageMs = Math.abs(Date.now() - tsMs);
  if (ageMs > 5 * 60 * 1000) return false; // 5 minutes tolerance

  const secretB64 = webhookSecret.startsWith("whsec_")
    ? webhookSecret.slice("whsec_".length)
    : webhookSecret;

  const secretBytes = Uint8Array.from(atob(secretB64), (c) => c.charCodeAt(0));

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const macBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
  const expectedSigB64 = btoa(String.fromCharCode(...new Uint8Array(macBuf)));

  const candidates = extractSignatureCandidates(svixSignature);
  return candidates.some((c) => c === expectedSigB64);
}

function mapResendEventType(type: string): string | null {
  // Resend types look like: "email.opened", "email.clicked", ...
  const normalized = type.trim().toLowerCase();
  if (!normalized.startsWith("email.")) return null;
  const eventType = normalized.slice("email.".length);
  const allowed = new Set(["sent", "delivered", "opened", "clicked", "replied", "bounced", "unsubscribed", "failed"]);
  return allowed.has(eventType) ? eventType : null;
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
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");
    const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET") || "";
    if (!webhookSecret) {
      return new Response(JSON.stringify({ error: "Missing RESEND_WEBHOOK_SECRET" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Important: verify using raw body (string). Do not parse JSON before verification.
    const rawBody = await req.text();
    const isValid = await verifySvixSignature({ svixId, svixTimestamp, svixSignature, webhookSecret, rawBody });
    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.parse(rawBody) as any;
    const eventType = payload?.type ? mapResendEventType(payload.type) : null;
    if (!eventType) {
      // Ignore unknown event types.
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = payload?.data ?? {};
    const tags = data?.tags ?? {};
    const campaignIdFromTags = tags?.campaign_id || tags?.campaignId || null;
    const contactIdFromTags = tags?.contact_id || tags?.contactId || null;
    const providerEmailId = data?.email_id || null;
    const eventCreatedAt = data?.created_at ? new Date(data.created_at).toISOString() : new Date().toISOString();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRole);

    // Resolve recipient row:
    // Prefer mapping via tags we set when sending.
    let recipientRow: any = null;
    let campaignId: string | null = campaignIdFromTags ? String(campaignIdFromTags) : null;
    if (campaignId && contactIdFromTags) {
      const { data: r } = await admin
        .from("email_campaign_recipients")
        .select("id,user_id,status")
        .eq("campaign_id", campaignId)
        .eq("contact_id", String(contactIdFromTags))
        .maybeSingle();
      recipientRow = r || null;
    }

    // Fallback: map by provider_message_id (= Resend email id) if tags aren't present.
    if (!recipientRow && providerEmailId) {
      const { data: r } = await admin
        .from("email_campaign_recipients")
        .select("id,user_id,status,campaign_id")
        .eq("provider_message_id", String(providerEmailId))
        .maybeSingle();
      recipientRow = r || null;
      campaignId = recipientRow?.campaign_id ?? campaignId;
    }

    if (!recipientRow || !campaignId) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recipientId: string = recipientRow.id;
    const userId: string = recipientRow.user_id;

    // Update recipient status (except "replied" which is tracked as an email_event only).
    const statusUpdates: Record<string, any> = {};
    if (eventType !== "replied") {
      statusUpdates.status = eventType;
      if (eventType === "sent") statusUpdates.sent_at = eventCreatedAt;
      if (eventType === "opened") statusUpdates.opened_at = eventCreatedAt;
      if (eventType === "clicked") statusUpdates.clicked_at = data?.click?.timestamp ? new Date(data.click.timestamp).toISOString() : eventCreatedAt;
      if (eventType === "bounced") statusUpdates.bounced_at = eventCreatedAt;
      if (eventType === "unsubscribed") statusUpdates.unsubscribed_at = eventCreatedAt;
    }

    if (Object.keys(statusUpdates).length > 0) {
      await admin
        .from("email_campaign_recipients")
        .update(statusUpdates)
        .eq("id", recipientId);
    }

    // Deduplicate event inserts (prevents inflated analytics if Resend retries webhooks).
    const { data: existing } = await admin
      .from("email_events")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("recipient_id", recipientId)
      .eq("event_type", eventType)
      .maybeSingle();

    if (!existing) {
      await admin.from("email_events").insert({
        user_id: userId,
        campaign_id: campaignId,
        recipient_id: recipientId,
        event_type: eventType,
        event_payload: data,
      });
    }

    // Roll up counts in email_campaigns.
    const [
      { count: opensCount },
      { count: clicksCount },
      { count: bouncesCount },
      { count: unsubscribesCount },
      { count: repliesCount },
    ] = await Promise.all([
      admin
        .from("email_campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .in("status", ["opened", "clicked"]),
      admin
        .from("email_campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", "clicked"),
      admin
        .from("email_campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", "bounced"),
      admin
        .from("email_campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", "unsubscribed"),
      admin
        .from("email_events")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("event_type", "replied"),
    ]);

    await admin
      .from("email_campaigns")
      .update({
        opens_count: opensCount ?? 0,
        clicks_count: clicksCount ?? 0,
        replies_count: repliesCount ?? 0,
        bounces_count: bouncesCount ?? 0,
        unsubscribes_count: unsubscribesCount ?? 0,
      })
      .eq("id", campaignId)
      .eq("user_id", userId);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("resend-email-webhook error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

