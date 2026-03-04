import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const FB_API_VERSION = "v18.0";

async function getYouTubeAccessToken(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const { data: account } = await supabase
    .from("connected_accounts")
    .select("id, access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .eq("platform", "youtube")
    .eq("is_active", true)
    .single();
  if (!account?.access_token && !account?.refresh_token) return null;

  const expiresAt = account.expires_at ? new Date(account.expires_at).getTime() : 0;
  const now = Date.now();
  if (account.access_token && expiresAt > now + 60000) return account.access_token;

  if (!account.refresh_token) return account.access_token || null;
  const clientId = Deno.env.get("YOUTUBE_CLIENT_ID");
  const clientSecret = Deno.env.get("YOUTUBE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return account.access_token || null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: account.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    console.error("YouTube token refresh failed:", res.status, await res.text());
    return account.access_token || null;
  }
  const tokens = await res.json();
  const newExpires = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();
  await supabase
    .from("connected_accounts")
    .update({ access_token: tokens.access_token, expires_at: newExpires })
    .eq("id", account.id);
  return tokens.access_token;
}

function getUserIdFromJwt(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const userId = getUserIdFromJwt(req);
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: userPostIds, error: postsErr } = await supabase
      .from("posts")
      .select("id")
      .eq("user_id", userId);
    if (postsErr) throw postsErr;
    const postIds = (userPostIds || []).map((p: { id: string }) => p.id);
    if (!postIds.length) {
      return new Response(
        JSON.stringify({ message: "No posts found", updated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: rowsWithUser, error: fetchError } = await supabase
      .from("platform_posts")
      .select("id, post_id, platform, platform_post_id")
      .eq("status", "published")
      .not("platform_post_id", "is", null)
      .in("platform", ["youtube", "instagram"])
      .in("post_id", postIds);

    if (fetchError) throw fetchError;
    if (!rowsWithUser?.length) {
      return new Response(
        JSON.stringify({ message: "No published posts to sync", updated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const posts = rowsWithUser as { id: string; post_id: string; platform: string; platform_post_id: string }[];
    const byPlatform: Record<string, typeof posts> = {};
    posts.forEach((p) => {
      if (!byPlatform[p.platform]) byPlatform[p.platform] = [];
      byPlatform[p.platform].push(p);
    });

    let updated = 0;
    let youtubeSkipped = false;

    if (byPlatform.youtube?.length) {
      const ids = byPlatform.youtube.map((p) => p.platform_post_id).filter(Boolean);
      const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY");
      let accessToken: string | null = null;
      if (!youtubeApiKey) {
        accessToken = await getYouTubeAccessToken(supabase, userId);
        if (!accessToken) {
          console.error("YouTube: no YOUTUBE_API_KEY and no valid OAuth token - add secret or reconnect YouTube");
          youtubeSkipped = true;
        }
      }

      const authHeader =
        youtubeApiKey ? {} : accessToken ? { Authorization: `Bearer ${accessToken}` } : null;
      const urlParam = youtubeApiKey ? `&key=${encodeURIComponent(youtubeApiKey)}` : "";

      if (!youtubeSkipped && (authHeader !== null || youtubeApiKey)) {
        for (let i = 0; i < ids.length; i += 50) {
          const chunk = ids.slice(i, i + 50);
          const res = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${chunk.join(",")}${urlParam}`,
            { headers: authHeader || {} }
          );
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            if (res.status === 401 && accessToken && !youtubeApiKey) {
              const retryToken = await getYouTubeAccessToken(supabase, userId);
              if (retryToken) {
                const retryRes = await fetch(
                  `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${chunk.join(",")}${urlParam}`,
                  { headers: { Authorization: `Bearer ${retryToken}` } }
                );
                if (retryRes.ok) {
                  const retryJson = await retryRes.json().catch(() => ({}));
                  const items = retryJson.items || [];
                  for (const item of items) {
                    const vid = item.id;
                    const stats = item.statistics || {};
                    const platformPost = byPlatform.youtube.find((p) => p.platform_post_id === vid);
                    if (!platformPost) continue;
                    const views = parseInt(stats.viewCount || "0", 10);
                    const likes = parseInt(stats.likeCount || "0", 10);
                    const comments = parseInt(stats.commentCount || "0", 10);
                    const { error: upErr } = await supabase
                      .from("platform_posts")
                      .update({ views, likes, comments })
                      .eq("id", platformPost.id);
                    if (!upErr) updated++;
                  }
                  continue;
                }
              }
            }
            console.error("YouTube metrics fetch failed:", res.status, JSON.stringify(json));
            continue;
          }
          const items = json.items || [];
          for (const item of items) {
            const vid = item.id;
            const stats = item.statistics || {};
            const platformPost = byPlatform.youtube.find((p) => p.platform_post_id === vid);
            if (!platformPost) continue;
            const views = parseInt(stats.viewCount || "0", 10);
            const likes = parseInt(stats.likeCount || "0", 10);
            const comments = parseInt(stats.commentCount || "0", 10);
            const { error: upErr } = await supabase
              .from("platform_posts")
              .update({ views, likes, comments })
              .eq("id", platformPost.id);
            if (upErr) console.error("YouTube platform_posts update failed:", platformPost.id, upErr);
            else updated++;
          }
        }
      }
    }

    if (byPlatform.instagram?.length) {
      const { data: account } = await supabase
        .from("connected_accounts")
        .select("access_token")
        .eq("user_id", userId)
        .eq("platform", "instagram")
        .eq("is_active", true)
        .single();
      if (account?.access_token) {
        const token = account.access_token;
        for (const p of byPlatform.instagram) {
          const baseUrl = `https://graph.facebook.com/${FB_API_VERSION}/${p.platform_post_id}`;
          const res = await fetch(
            `${baseUrl}?fields=like_count,comments_count,media_type&access_token=${encodeURIComponent(token)}`
          );
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            console.error("Instagram metrics fetch failed:", p.platform_post_id, res.status, JSON.stringify(json));
            continue;
          }
          const data = json.data ?? json;
          const likes = parseInt(data.like_count ?? json.like_count ?? "0", 10);
          const comments = parseInt(data.comments_count ?? json.comments_count ?? "0", 10);
          let views = 0;
          const mediaType = (data.media_type ?? json.media_type ?? "").toUpperCase();
          const period = "lifetime";
          const metricNames =
            mediaType === "VIDEO" || mediaType === "REELS"
              ? ["video_views", "plays", "impressions", "reach"]
              : ["impressions", "reach"];
          for (const metric of metricNames) {
            const insightsRes = await fetch(
              `${baseUrl}/insights?metric=${metric}&period=${period}&access_token=${encodeURIComponent(token)}`
            );
            const insightsJson = await insightsRes.json().catch(() => ({}));
            if (insightsRes.ok) {
              const list = insightsJson.data ?? [];
              const item = list.find((x: { name?: string }) => x.name === metric);
              const val = parseInt(item?.values?.[0]?.value ?? "0", 10);
              if (val > 0) {
                views = val;
                break;
              }
            } else {
              if (insightsRes.status === 400 || insightsRes.status === 403) {
                console.error(
                  "Instagram insights:",
                  metric,
                  insightsRes.status,
                  (insightsJson as { error?: { message?: string } })?.error?.message ?? JSON.stringify(insightsJson)
                );
              }
            }
          }
          const { error: upErr } = await supabase
            .from("platform_posts")
            .update({ likes, comments, views })
            .eq("id", p.id);
          if (upErr) console.error("Instagram platform_posts update failed:", p.id, upErr);
          else updated++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: "Metrics synced",
        found: posts.length,
        updated,
        ...(youtubeSkipped && { hint: "Add YOUTUBE_API_KEY secret for YouTube stats, or reconnect YouTube." }),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("sync-platform-metrics error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
