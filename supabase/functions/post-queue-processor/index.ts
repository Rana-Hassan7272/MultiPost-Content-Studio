import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date().toISOString();

    const { data: scheduledPosts, error: fetchError } = await supabase
      .from("posts")
      .select(`
        id,
        user_id,
        title,
        description,
        media_ids,
        platforms,
        scheduled_for
      `)
      .eq("status", "scheduled")
      .lte("scheduled_for", now)
      .limit(10);

    if (fetchError) {
      throw fetchError;
    }

    if (!scheduledPosts || scheduledPosts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No posts to process", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = [];

    for (const post of scheduledPosts) {
      try {
        for (const platform of post.platforms) {
          if (platform === "youtube") {
            const { data: account } = await supabase
              .from("connected_accounts")
              .select("id")
              .eq("user_id", post.user_id)
              .eq("platform", "youtube")
              .eq("is_active", true)
              .single();

            if (!account) {
              throw new Error("No active YouTube account connected");
            }

            const { data: media } = await supabase
              .from("media_library")
              .select("file_url")
              .eq("id", post.media_ids[0])
              .single();

            if (!media) {
              throw new Error("Media not found");
            }

            const publishResponse = await fetch(
              `${supabaseUrl}/functions/v1/youtube-publish`,
              {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${supabaseServiceKey}`,
                  "apikey": supabaseServiceKey,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  postId: post.id,
                  accountId: account.id,
                  title: post.title,
                  description: post.description || "",
                  tags: post.tags || [],
                  videoUrl: media.file_url,
                  scheduledFor: null,
                }),
              }
            );

            if (!publishResponse.ok) {
              const error = await publishResponse.json();
              throw new Error(error.error || "Publish failed");
            }

            const publishData = await publishResponse.json();

            await supabase
              .from("platform_posts")
              .update({
                platform_post_id: publishData.videoId,
                status: "published",
                published_at: now,
              })
              .eq("post_id", post.id)
              .eq("platform", "youtube");
          } else {
            await supabase.from("platform_posts").insert({
              post_id: post.id,
              platform,
              status: "pending",
              published_at: null,
            });
          }
        }

        await supabase
          .from("posts")
          .update({
            status: "published",
            published_at: now,
          })
          .eq("id", post.id);

        results.push({ postId: post.id, success: true });
      } catch (error) {
        console.error(`Error processing post ${post.id}:`, error);
        
        await supabase
          .from("posts")
          .update({ status: "failed" })
          .eq("id", post.id);

        await supabase
          .from("platform_posts")
          .update({
            status: "failed",
            error_message: error.message,
          })
          .eq("post_id", post.id);

        results.push({ postId: post.id, success: false, error: error.message });
      }
    }

    return new Response(
      JSON.stringify({
        message: "Queue processed",
        processed: scheduledPosts.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Queue processor error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});