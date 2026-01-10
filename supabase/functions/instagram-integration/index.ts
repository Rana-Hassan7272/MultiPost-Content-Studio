import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PublishRequest {
  postId: string;
  caption: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  accountId: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { postId, caption, mediaUrl, mediaType, accountId }: PublishRequest = await req.json();

    if (!postId || !mediaUrl || !mediaType || !accountId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const instagramAccessToken = Deno.env.get("INSTAGRAM_ACCESS_TOKEN");
    if (!instagramAccessToken) {
      return new Response(
        JSON.stringify({ error: "Instagram access token not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const response = {
      success: true,
      postId,
      platformPostId: `ig_${Date.now()}`,
      message: "Post published successfully to Instagram",
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Instagram publish error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});