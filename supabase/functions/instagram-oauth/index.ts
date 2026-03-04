import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const FB_API_VERSION = "v18.0";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const appId = Deno.env.get("META_APP_ID");
    const appSecret = Deno.env.get("META_APP_SECRET");
    const redirectUri = Deno.env.get("META_REDIRECT_URI") || "http://localhost:5173/";

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "auth_url") {
      let userId = url.searchParams.get("userId");
      if (!userId && req.method === "POST") {
        try {
          const body = await req.json();
          userId = body.userId;
        } catch {
        }
      }
      if (!appId || !redirectUri) {
        return new Response(
          JSON.stringify({ error: "META_APP_ID or META_REDIRECT_URI not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!userId) {
        return new Response(
          JSON.stringify({ error: "userId required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      const { data: profile } = await supabaseAdmin.from("profiles").select("id").eq("id", userId).single();
      if (!profile) {
        return new Response(
          JSON.stringify({ error: "Invalid user" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const state = `instagram_${userId}`;
      const scope = "public_profile,pages_show_list,pages_read_engagement,business_management,instagram_basic,instagram_content_publish,instagram_manage_insights";
      const authUrl = `https://www.facebook.com/${FB_API_VERSION}/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}&response_type=code`;
      return new Response(JSON.stringify({ authUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code || !state || !state.startsWith("instagram_")) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid callback parameters" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const userId = state.replace("instagram_", "");
      if (!appId || !appSecret || !redirectUri) {
        return new Response(
          JSON.stringify({ success: false, error: "Instagram API not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tokenRes = await fetch(
        `https://graph.facebook.com/${FB_API_VERSION}/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`
      );
      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        return new Response(
          JSON.stringify({ success: false, error: "Token exchange failed", details: errText }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const tokenData = await tokenRes.json();
      let accessToken = tokenData.access_token;
      if (!accessToken) {
        return new Response(
          JSON.stringify({ success: false, error: "No access token" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const longLivedRes = await fetch(
        `https://graph.facebook.com/${FB_API_VERSION}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${accessToken}`
      );
      if (longLivedRes.ok) {
        const longLivedData = await longLivedRes.json();
        if (longLivedData.access_token) accessToken = longLivedData.access_token;
      }

      const accountsRes = await fetch(
        `https://graph.facebook.com/${FB_API_VERSION}/me/accounts?fields=id,name,access_token&access_token=${accessToken}`
      );
      if (!accountsRes.ok) {
        return new Response(
          JSON.stringify({ success: false, error: "Failed to get pages" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const accountsData = await accountsRes.json();
      let pages = accountsData.data || [];

      if (pages.length === 0) {
        const businessesRes = await fetch(
          `https://graph.facebook.com/${FB_API_VERSION}/me/businesses?access_token=${accessToken}`
        );
        if (businessesRes.ok) {
          const businessesData = await businessesRes.json();
          const businesses = businessesData.data || [];
          for (const business of businesses) {
            const ownedRes = await fetch(
              `https://graph.facebook.com/${FB_API_VERSION}/${business.id}/owned_pages?fields=id,name,access_token,instagram_business_account&access_token=${accessToken}`
            );
            if (!ownedRes.ok) continue;
            const ownedData = await ownedRes.json();
            const ownedPages = ownedData.data || [];
            for (const p of ownedPages) {
              if (p.instagram_business_account?.id) {
                pages = [{ id: p.id, name: p.name, access_token: p.access_token, instagram_business_account: p.instagram_business_account }];
                break;
              }
            }
            if (pages.length > 0) break;
          }
        }
      }

      if (pages.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "No Facebook Page found. Add business_management permission and ensure your Business (KD) has a Page linked to Instagram." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let igAccountId: string | null = null;
      let pageAccessToken: string | null = null;
      for (const page of pages) {
        const pageToken = page.access_token;
        const pageId = page.id;
        let instagramAccount = page.instagram_business_account;
        if (!instagramAccount) {
          const pageInfoRes = await fetch(
            `https://graph.facebook.com/${FB_API_VERSION}/${pageId}?fields=instagram_business_account&access_token=${pageToken}`
          );
          if (!pageInfoRes.ok) continue;
          const pageInfo = await pageInfoRes.json();
          instagramAccount = pageInfo.instagram_business_account;
        }
        if (instagramAccount?.id) {
          igAccountId = instagramAccount.id;
          pageAccessToken = pageToken;
          break;
        }
      }

      if (!igAccountId || !pageAccessToken) {
        return new Response(
          JSON.stringify({ success: false, error: "No Instagram Business account linked to your Page. Link Instagram in Meta Business Settings." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const igRes = await fetch(
        `https://graph.facebook.com/${FB_API_VERSION}/${igAccountId}?fields=username&access_token=${pageAccessToken}`
      );
      if (!igRes.ok) {
        return new Response(
          JSON.stringify({ success: false, error: "Failed to get Instagram profile" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const igProfile = await igRes.json();
      const username = igProfile.username || igAccountId;

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      const { data: existing } = await supabaseAdmin
        .from("connected_accounts")
        .select("id")
        .eq("user_id", userId)
        .eq("platform", "instagram")
        .eq("account_id", igAccountId)
        .single();

      const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
      if (existing) {
        await supabaseAdmin
          .from("connected_accounts")
          .update({
            account_name: username,
            access_token: pageAccessToken,
            expires_at: expiresAt,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabaseAdmin.from("connected_accounts").insert({
          user_id: userId,
          platform: "instagram",
          account_name: username,
          account_id: igAccountId,
          access_token: pageAccessToken,
          expires_at: expiresAt,
          is_active: true,
        });
      }

      return new Response(
        JSON.stringify({ success: true, account_name: username }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Instagram OAuth error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
