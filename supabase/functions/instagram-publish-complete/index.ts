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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Phase 1: Create containers for pending videos (Instagram downloads from our URL; done here to avoid user-request timeout)
    const { data: pendingRows } = await supabase
      .from("platform_posts")
      .select("post_id, instagram_file_path, instagram_media_type")
      .eq("platform", "instagram")
      .eq("status", "pending")
      .not("instagram_file_path", "is", null)
      .limit(2);

    if (pendingRows?.length) {
      for (const row of pendingRows) {
        const { data: post } = await supabase
          .from("posts")
          .select("user_id, title, description")
          .eq("id", row.post_id)
          .single();
        if (!post) continue;

        const { data: account } = await supabase
          .from("connected_accounts")
          .select("account_id, access_token")
          .eq("user_id", post.user_id)
          .eq("platform", "instagram")
          .eq("is_active", true)
          .single();
        if (!account) continue;

        const { data: signed } = await supabase.storage
          .from("media")
          .createSignedUrl(row.instagram_file_path!, 7200);
        if (!signed?.signedUrl) {
          await supabase
            .from("platform_posts")
            .update({
              status: "failed",
              instagram_file_path: null,
              instagram_media_type: null,
              error_message: "Failed to generate media URL",
            })
            .eq("post_id", row.post_id)
            .eq("platform", "instagram");
          continue;
        }

        const caption = [post.title, post.description].filter(Boolean).join("\n\n").substring(0, 2200);
        const createUrl = `https://graph.facebook.com/${FB_API_VERSION}/${account.account_id}/media?access_token=${encodeURIComponent(account.access_token)}`;
        const body: Record<string, string> = {
          caption,
          media_type: "VIDEO",
          video_url: signed.signedUrl,
        };

        const createRes = await fetch(createUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const createText = await createRes.text();
        let createData: { id?: string; error?: { message: string } } = {};
        try {
          createData = JSON.parse(createText);
        } catch {
          createData = {};
        }

        if (!createRes.ok || createData.error || !createData.id) {
          await supabase
            .from("platform_posts")
            .update({
              status: "failed",
              instagram_file_path: null,
              instagram_media_type: null,
              error_message: createData.error?.message || createText.slice(0, 500),
            })
            .eq("post_id", row.post_id)
            .eq("platform", "instagram");
          continue;
        }

        await supabase
          .from("platform_posts")
          .update({
            status: "processing",
            instagram_container_id: createData.id,
            instagram_file_path: null,
            instagram_media_type: null,
          })
          .eq("post_id", row.post_id)
          .eq("platform", "instagram");
      }
    }

    // Phase 2: Poll and publish for rows that have a container (status = processing)
    const { data: rows, error: fetchError } = await supabase
      .from("platform_posts")
      .select("post_id, instagram_container_id")
      .eq("platform", "instagram")
      .eq("status", "processing")
      .not("instagram_container_id", "is", null)
      .limit(10);

    if (fetchError || !rows?.length) {
      return new Response(
        JSON.stringify({
          message: "Instagram completion run",
          containersCreated: pendingRows?.length ?? 0,
          processed: 0,
          completed: 0,
          failed: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let completed = 0;
    let failed = 0;

    for (const row of rows) {
      const { data: post } = await supabase
        .from("posts")
        .select("user_id")
        .eq("id", row.post_id)
        .single();
      if (!post) continue;

      const { data: account } = await supabase
        .from("connected_accounts")
        .select("account_id, access_token")
        .eq("user_id", post.user_id)
        .eq("platform", "instagram")
        .eq("is_active", true)
        .single();
      if (!account) continue;

      const containerId = row.instagram_container_id!;
      const pageToken = account.access_token;
      const igUserId = account.account_id;

      const statusRes = await fetch(
        `https://graph.facebook.com/${FB_API_VERSION}/${containerId}?fields=status_code&access_token=${pageToken}`
      );
      if (!statusRes.ok) continue;
      const statusData = await statusRes.json();
      const code = statusData.status_code;

      if (code === "EXPIRED" || code === "ERROR") {
        await supabase
          .from("platform_posts")
          .update({
            status: "failed",
            instagram_container_id: null,
            error_message: `Instagram: ${code}`,
          })
          .eq("post_id", row.post_id)
          .eq("platform", "instagram");
        failed++;
        continue;
      }

      if (code !== "FINISHED") continue;

      const publishParams = new URLSearchParams({
        creation_id: containerId,
        access_token: pageToken,
      });
      let publishRes = await fetch(
        `https://graph.facebook.com/${FB_API_VERSION}/${igUserId}/media_publish?${publishParams.toString()}`,
        { method: "POST" }
      );

      if (!publishRes.ok) {
        const errText = await publishRes.text();
        let errJson: { error?: { code?: number } } = {};
        try {
          errJson = JSON.parse(errText);
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
      }

      if (!publishRes.ok) {
        const errText = await publishRes.text();
        await supabase
          .from("platform_posts")
          .update({
            status: "failed",
            instagram_container_id: null,
            error_message: errText.slice(0, 500),
          })
          .eq("post_id", row.post_id)
          .eq("platform", "instagram");
        failed++;
        continue;
      }

      const publishData = await publishRes.json();
      const mediaId = publishData.id;

      await supabase
        .from("platform_posts")
        .update({
          platform_post_id: mediaId,
          status: "published",
          published_at: new Date().toISOString(),
          instagram_container_id: null,
        })
        .eq("post_id", row.post_id)
        .eq("platform", "instagram");

      await supabase
        .from("posts")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
        })
        .eq("id", row.post_id);

      completed++;
    }

    return new Response(
      JSON.stringify({
        message: "Instagram completion run",
        containersCreated: pendingRows?.length ?? 0,
        processed: rows.length,
        completed,
        failed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("instagram-publish-complete error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
