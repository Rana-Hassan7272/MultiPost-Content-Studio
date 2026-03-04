import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const FB_API_VERSION = "v18.0";

interface PublishRequest {
  postId: string;
  accountId: string;
  caption: string;
  filePath: string;
  mediaType: "image" | "video";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: PublishRequest = await req.json();
    const { postId, accountId, caption, filePath, mediaType } = body;

    if (!postId || !accountId || !caption || !filePath || !mediaType) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: postId, accountId, caption, filePath, mediaType" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("user_id")
      .eq("id", postId)
      .single();

    if (postError || !post) {
      return new Response(
        JSON.stringify({ error: "Post not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: account, error: accountError } = await supabase
      .from("connected_accounts")
      .select("id, account_id, access_token, user_id")
      .eq("id", accountId)
      .eq("user_id", post.user_id)
      .eq("platform", "instagram")
      .eq("is_active", true)
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ error: "Instagram account not found or inactive" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isVideo = mediaType === "video";

    if (isVideo) {
      // Don't call Instagram here: they download the video from our URL and that can exceed function timeout (503).
      // Save job for instagram-publish-complete to create container and then poll/publish.
      const { error: updateErr } = await supabase
        .from("platform_posts")
        .update({
          status: "pending",
          instagram_file_path: filePath,
          instagram_media_type: mediaType,
          instagram_container_id: null,
        })
        .eq("post_id", postId)
        .eq("platform", "instagram");

      if (updateErr) {
        return new Response(
          JSON.stringify({ error: "Failed to queue video for publish" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          processing: true,
          message: "Video is being published; it may appear on Instagram in a few minutes.",
        }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: signed } = await supabase.storage
      .from("media")
      .createSignedUrl(filePath, 7200);

    if (!signed?.signedUrl) {
      return new Response(
        JSON.stringify({ error: "Failed to generate media URL" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const igUserId = account.account_id;
    const pageToken = account.access_token;

    const createUrl = `https://graph.facebook.com/${FB_API_VERSION}/${igUserId}/media?access_token=${encodeURIComponent(pageToken)}`;
    const createBody: Record<string, string> = {
      caption: caption.substring(0, 2200),
      image_url: signed.signedUrl,
    };

    const createRes = await fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createBody),
    });

    const createText = await createRes.text();
    let createData: { id?: string; error?: { message: string; code?: number } } = {};
    try {
      createData = JSON.parse(createText);
    } catch {
      createData = {};
    }

    if (!createRes.ok) {
      return new Response(
        JSON.stringify({
          error: createData.error?.message || createText || "Instagram API error",
          details: createText,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (createData.error) {
      return new Response(
        JSON.stringify({
          error: createData.error.message || "Instagram API error",
          details: createText,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const containerId = createData.id;
    if (!containerId) {
      return new Response(
        JSON.stringify({
          error: "No container ID from Instagram. Instagram may need a public HTTPS URL.",
          details: createText,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Wait for Instagram to finish processing (required before media_publish)
    const maxWait = 30;
    for (let i = 0; i < maxWait; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const statusRes = await fetch(
        `https://graph.facebook.com/${FB_API_VERSION}/${containerId}?fields=status_code&access_token=${encodeURIComponent(pageToken)}`
      );
      if (!statusRes.ok) break;
      const statusData = await statusRes.json();
      const code = statusData.status_code;
      if (code === "FINISHED") break;
      if (code === "EXPIRED" || code === "ERROR") {
        return new Response(
          JSON.stringify({ error: "Instagram media processing failed" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const publishParams = new URLSearchParams({
      creation_id: containerId,
      access_token: pageToken,
    });
    let publishRes = await fetch(
      `https://graph.facebook.com/${FB_API_VERSION}/${igUserId}/media_publish?${publishParams.toString()}`,
      { method: "POST" }
    );

    // Retry once if Instagram says "not ready" (9007)
    if (!publishRes.ok) {
      const errBody = await publishRes.text();
      let errJson: { error?: { code?: number } } = {};
      try {
        errJson = JSON.parse(errBody);
      } catch {
        // ignore
      }
      if (errJson.error?.code === 9007) {
        await new Promise((r) => setTimeout(r, 5000));
        publishRes = await fetch(
          `https://graph.facebook.com/${FB_API_VERSION}/${igUserId}/media_publish?${publishParams.toString()}`,
          { method: "POST" }
        );
      }
      if (!publishRes.ok) {
        const errText = await publishRes.text();
        return new Response(
          JSON.stringify({ error: `Instagram publish failed: ${errText}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const publishData = await publishRes.json();
    const mediaId = publishData.id;

    await supabase
      .from("platform_posts")
      .update({
        platform_post_id: mediaId,
        status: "published",
        published_at: new Date().toISOString(),
      })
      .eq("post_id", postId)
      .eq("platform", "instagram");

    await supabase
      .from("posts")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
      })
      .eq("id", postId);

    return new Response(
      JSON.stringify({
        success: true,
        mediaId,
        url: `https://www.instagram.com/p/${mediaId}/`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Instagram publish error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
