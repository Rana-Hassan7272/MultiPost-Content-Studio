import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clientId = Deno.env.get("YOUTUBE_CLIENT_ID")!;
    const clientSecret = Deno.env.get("YOUTUBE_CLIENT_SECRET")!;
    const redirectUri = Deno.env.get("YOUTUBE_REDIRECT_URI") || `${req.headers.get("origin")}/auth/youtube/callback`;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "auth_url") {
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent('https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/yt-analytics.readonly')}&` +
        `access_type=offline&` +
        `prompt=consent&` +
        `state=${user.id}`;

      return new Response(
        JSON.stringify({ authUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      
      if (!code) {
        throw new Error("No authorization code");
      }

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        throw new Error(`Failed to exchange code: ${errorText}`);
      }

      const tokens = await tokenResponse.json();

      if (!tokens.access_token) {
        throw new Error("No access token received");
      }

      const channelResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&access_token=${tokens.access_token}`
      );
      
      if (!channelResponse.ok) {
        throw new Error("Failed to fetch channel info");
      }

      const channelData = await channelResponse.json();
      const channel = channelData.items?.[0];

      const expiresAt = new Date(Date.now() + ((tokens.expires_in || 3600) * 1000)).toISOString();

      const accountData = {
        user_id: state || user.id,
        platform: "youtube",
        account_name: channel?.snippet?.title || "YouTube Channel",
        account_id: channel?.id || `user_${state || user.id}`,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        expires_at: expiresAt,
        is_active: true,
      };

      const { error: dbError } = await supabase
        .from("connected_accounts")
        .upsert(accountData, {
          onConflict: "user_id,platform,account_id"
        });

      if (dbError) {
        console.error("Database error:", dbError);
        throw dbError;
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          channel: channel?.snippet?.title || "YouTube Channel",
          account_id: channel?.id 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error("Invalid action");
  } catch (error) {
    console.error("YouTube OAuth error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

