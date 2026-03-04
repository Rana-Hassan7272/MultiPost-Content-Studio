import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function computeNextRunAt(after: Date, daysOfWeek: number[], timeLocal: string): string {
  const [hours, minutes] = timeLocal.split(":").map(Number);
  const d = new Date(after);
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(hours, minutes ?? 0, 0, 0);
  for (let i = 0; i < 8; i++) {
    const c = new Date(d);
    c.setUTCDate(c.getUTCDate() + i);
    if (daysOfWeek.includes(c.getUTCDay())) return c.toISOString();
  }
  return d.toISOString();
}

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
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    const apikeyHeader = req.headers.get("apikey") || req.headers.get("Apikey");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    if (!supabaseServiceKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Service role key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    let providedKey: string | null = null;
    
    if (authHeader) {
      providedKey = authHeader.replace(/^Bearer\s+/i, "").trim();
    }
    
    const expectedKey = supabaseServiceKey.trim();
    
    if (!providedKey) {
      console.error("No Authorization header provided");
      return new Response(
        JSON.stringify({ error: "Unauthorized - Service role key required in Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const providedKeyTrimmed = providedKey.trim();
    const expectedKeyTrimmed = expectedKey.trim();
    
    if (providedKeyTrimmed !== expectedKeyTrimmed) {
      console.error("Service role key mismatch", {
        providedKeyPrefix: providedKeyTrimmed.substring(0, 20) + "...",
        expectedKeyPrefix: expectedKeyTrimmed.substring(0, 20) + "...",
        providedKeyLength: providedKeyTrimmed.length,
        expectedKeyLength: expectedKeyTrimmed.length
      });
      return new Response(
        JSON.stringify({ 
          error: "Unauthorized - Invalid service role key",
          hint: "Verify SUPABASE_SERVICE_ROLE_KEY in GitHub secrets matches Supabase service role key"
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const nowISO = now.toISOString();

    // 1) Process recurring schedules: create posts for due recurrences and advance next_run_at
    const { data: dueRecurring, error: recurringFetchError } = await supabase
      .from("recurring_schedules")
      .select("*")
      .eq("is_active", true)
      .lte("next_run_at", nowISO)
      .limit(5);

    if (!recurringFetchError && dueRecurring && dueRecurring.length > 0) {
      for (const rec of dueRecurring) {
        try {
          const [hours, minutes] = (rec.time_local as string).split(":").map(Number);
          const { data: newPost, error: insertPostError } = await supabase
            .from("posts")
            .insert({
              user_id: rec.user_id,
              title: rec.title,
              description: rec.description ?? null,
              tags: Array.isArray(rec.tags) ? rec.tags : [],
              media_ids: Array.isArray(rec.media_ids) ? rec.media_ids : [],
              platforms: rec.platforms,
              status: "scheduled",
              scheduled_for: rec.next_run_at,
            })
            .select("id")
            .single();
          if (insertPostError || !newPost) throw new Error(insertPostError?.message || "Failed to create post");
          for (const platform of rec.platforms) {
            await supabase.from("platform_posts").insert({
              post_id: newPost.id,
              platform,
              status: "pending",
            });
          }
          const nextRun = computeNextRunAt(
            new Date(rec.next_run_at),
            rec.days_of_week as number[],
            rec.time_local as string
          );
          await supabase
            .from("recurring_schedules")
            .update({ next_run_at: nextRun, updated_at: nowISO })
            .eq("id", rec.id);
        } catch (e) {
          console.error("Recurring schedule error", rec.id, e);
        }
      }
    }

    // 2) Process one-time scheduled posts
    const { data: scheduledPosts, error: fetchError } = await supabase
      .from("posts")
      .select(`
        id,
        user_id,
        title,
        description,
        tags,
        media_ids,
        platforms,
        scheduled_for
      `)
      .eq("status", "scheduled")
      .lte("scheduled_for", nowISO)
      .limit(10);

    if (fetchError) {
      throw fetchError;
    }

    if (!scheduledPosts || scheduledPosts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No posts to process", processed: 0, recurringProcessed: dueRecurring?.length ?? 0 }),
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

            let filePath: string | null = null;
            try {
              const urlObj = new URL(media.file_url);
              const pathParts = urlObj.pathname.split('/').filter(p => p);
              const mediaIndex = pathParts.indexOf('media');
              
              if (mediaIndex !== -1 && mediaIndex < pathParts.length - 1) {
                filePath = pathParts.slice(mediaIndex + 1).join('/');
              }
            } catch (urlError) {
              const urlParts = media.file_url.split('/');
              const mediaIndex = urlParts.indexOf('media');
              if (mediaIndex !== -1 && mediaIndex < urlParts.length - 1) {
                filePath = urlParts.slice(mediaIndex + 1).join('/');
              }
            }

            if (!filePath) {
              throw new Error("Could not extract file path from media URL");
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
                  tags: Array.isArray(post.tags) ? post.tags : [],
                  filePath: filePath,
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
          } else if (platform === "instagram") {
            const { data: igAccount } = await supabase
              .from("connected_accounts")
              .select("id")
              .eq("user_id", post.user_id)
              .eq("platform", "instagram")
              .eq("is_active", true)
              .single();

            if (!igAccount) {
              throw new Error("No active Instagram account connected");
            }

            const { data: media } = await supabase
              .from("media_library")
              .select("file_url, file_type")
              .eq("id", post.media_ids[0])
              .single();

            if (!media) {
              throw new Error("Media not found");
            }

            let filePath: string | null = null;
            try {
              const urlObj = new URL(media.file_url);
              const pathParts = urlObj.pathname.split("/").filter((p: string) => p);
              const mediaIndex = pathParts.indexOf("media");
              if (mediaIndex !== -1 && mediaIndex < pathParts.length - 1) {
                filePath = pathParts.slice(mediaIndex + 1).join("/");
              }
            } catch {
              const urlParts = media.file_url.split("/");
              const mediaIndex = urlParts.indexOf("media");
              if (mediaIndex !== -1 && mediaIndex < urlParts.length - 1) {
                filePath = urlParts.slice(mediaIndex + 1).join("/");
              }
            }

            if (!filePath) {
              throw new Error("Could not extract file path from media URL");
            }

            const caption = [post.title, post.description].filter(Boolean).join("\n\n");
            const mediaType = media.file_type === "video" ? "video" : "image";

            const igPublishResponse = await fetch(
              `${supabaseUrl}/functions/v1/instagram-publish`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${supabaseServiceKey}`,
                  apikey: supabaseServiceKey,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  postId: post.id,
                  accountId: igAccount.id,
                  caption,
                  filePath,
                  mediaType,
                }),
              }
            );

            if (!igPublishResponse.ok && igPublishResponse.status !== 202) {
              const err = await igPublishResponse.json();
              throw new Error(err.error || "Instagram publish failed");
            }
            // 202 = video queued for async completion (instagram-publish-complete will finish it)
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
            published_at: nowISO,
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

    // Finish any Instagram videos that were queued (status = processing)
    try {
      await fetch(`${supabaseUrl}/functions/v1/instagram-publish-complete`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseServiceKey}`,
          apikey: supabaseServiceKey,
          "Content-Type": "application/json",
        },
      });
    } catch (e) {
      console.error("instagram-publish-complete call failed:", e);
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