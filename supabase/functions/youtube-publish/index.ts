import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PublishRequest {
  postId: string;
  accountId: string;
  title: string;
  description: string;
  tags?: string[];
  videoUrl?: string;
  filePath?: string;
  scheduledFor?: string;
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
    const { postId, accountId, title, description, tags = [], videoUrl, filePath, scheduledFor } = body;

    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("user_id")
      .eq("id", postId)
      .single();

    if (postError || !post) {
      throw new Error("Post not found");
    }

    const userId = post.user_id;

    const { data: account, error: accountError } = await supabase
      .from("connected_accounts")
      .select("*")
      .eq("id", accountId)
      .eq("user_id", userId)
      .eq("platform", "youtube")
      .single();

    if (accountError || !account) {
      throw new Error("YouTube account not found");
    }

    let accessToken = account.access_token;

    const channelCheck = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=id&mine=true&access_token=${accessToken}`
    );

    if (!channelCheck.ok) {
      const channelError = await channelCheck.json();
      if (channelError.error?.errors?.[0]?.reason === 'youtubeSignupRequired') {
        throw new Error("YouTube channel not found. Please create a YouTube channel for this Google account first. Go to youtube.com and create a channel.");
      }
      throw new Error(`YouTube API error: ${JSON.stringify(channelError)}`);
    }

    const channelData = await channelCheck.json();
    if (!channelData.items || channelData.items.length === 0) {
      throw new Error("No YouTube channel found. Please create a YouTube channel for this Google account first.");
    }

    if (account.expires_at && new Date(account.expires_at) <= new Date()) {
      if (!account.refresh_token) {
        throw new Error("Token expired and no refresh token");
      }

      const clientId = Deno.env.get("YOUTUBE_CLIENT_ID")!;
      const clientSecret = Deno.env.get("YOUTUBE_CLIENT_SECRET")!;
      const redirectUri = Deno.env.get("YOUTUBE_REDIRECT_URI")!;

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: account.refresh_token,
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error("Failed to refresh token");
      }

      const tokens = await tokenResponse.json();
      accessToken = tokens.access_token;

      const expiresAt = new Date(Date.now() + ((tokens.expires_in || 3600) * 1000)).toISOString();

      await supabase
        .from("connected_accounts")
        .update({
          access_token: accessToken,
          expires_at: expiresAt,
        })
        .eq("id", accountId);
    }

    const metadata = {
      snippet: {
        title,
        description,
        ...(tags.length > 0 && { tags }),
      },
      status: scheduledFor ? {
        privacyStatus: "private",
        publishAt: new Date(scheduledFor).toISOString(),
      } : {
        privacyStatus: "public",
      }
    };

    const initResponse = await fetch(
      `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&access_token=${accessToken}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(metadata),
      }
    );

    if (!initResponse.ok) {
      const errorText = await initResponse.text();
      throw new Error(`Failed to initialize upload: ${errorText}`);
    }

    const uploadUrl = initResponse.headers.get("Location");
    if (!uploadUrl) {
      throw new Error("No upload URL received");
    }

    let videoData: Uint8Array;

    if (filePath) {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('media')
        .download(filePath);

      if (downloadError || !fileData) {
        throw new Error(`Failed to download video from storage: ${downloadError?.message || 'Unknown error'}`);
      }

      const arrayBuffer = await fileData.arrayBuffer();
      videoData = new Uint8Array(arrayBuffer);
    } else if (videoUrl) {
      const videoResponse = await fetch(videoUrl);
      if (!videoResponse.ok) {
        const errorText = await videoResponse.text();
        throw new Error(`Failed to fetch video from URL: ${videoResponse.status} ${videoResponse.statusText} - ${errorText}`);
      }

      const videoStream = videoResponse.body;
      if (!videoStream) {
        throw new Error("No video stream available");
      }

      const reader = videoStream.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      videoData = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        videoData.set(chunk, offset);
        offset += chunk.length;
      }
    } else {
      throw new Error("No video file path or URL provided");
    }

    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/*",
        "Content-Length": videoData.length.toString(),
      },
      body: videoData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`YouTube upload failed: ${errorText}`);
    }

    const uploadData = await uploadResponse.json();
    const youtubeVideoId = uploadData.id;

    const { error: updateError } = await supabase
      .from("platform_posts")
      .update({
        platform_post_id: youtubeVideoId,
        status: scheduledFor ? "pending" : "published",
        published_at: scheduledFor ? null : new Date().toISOString(),
      })
      .eq("post_id", postId)
      .eq("platform", "youtube");

    if (updateError) throw updateError;

    if (!scheduledFor) {
      await supabase
        .from("posts")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
        })
        .eq("id", postId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        videoId: youtubeVideoId,
        url: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("YouTube publish error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

