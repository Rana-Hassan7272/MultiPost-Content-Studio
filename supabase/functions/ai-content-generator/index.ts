import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GenerateRequest {
  userId: string;
  platform: 'youtube' | 'instagram' | 'tiktok';
  contentType: 'title' | 'description' | 'hashtags' | 'tags' | 'all';
  videoTitle?: string;
  videoDescription?: string;
  keywords?: string[];
  voiceProfileId?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiApiKey = Deno.env.get("GOOGLE_AI_API_KEY")!;

    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: "Gemini API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const body: GenerateRequest = await req.json();
    const { userId, platform, contentType, videoTitle, videoDescription, keywords = [], voiceProfileId } = body;

    if (userId !== user.id) {
      throw new Error("Unauthorized");
    }

    let voiceProfile = null;
    if (voiceProfileId) {
      const { data } = await supabase
        .from("voice_profiles")
        .select("*")
        .eq("id", voiceProfileId)
        .eq("user_id", userId)
        .single();
      voiceProfile = data;
    }

    const prompt = buildPrompt(platform, contentType, videoTitle, videoDescription, keywords, voiceProfile);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }]
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${error}`);
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const parsed = parseAIResponse(generatedText, contentType, platform);

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("AI content generator error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildPrompt(
  platform: string,
  contentType: string,
  videoTitle?: string,
  videoDescription?: string,
  keywords: string[] = [],
  voiceProfile: any = null
): string {
  const platformRules = {
    youtube: "YouTube: Focus on SEO, include keywords, 60-100 characters for titles, detailed descriptions up to 5000 chars. Use comma-separated tags.",
    instagram: "Instagram: Engaging captions up to 2200 chars, use hashtags (10-30 hashtags), emoji-friendly, trending hashtags.",
    tiktok: "TikTok: Short punchy captions (up to 2200 chars), trending hashtags (#FYP, #ForYou, #Viral), Gen-Z language, viral hooks."
  };

  const voiceInstructions = voiceProfile ? `
Voice Profile Guidelines:
- Tone: ${voiceProfile.tone_style?.join(', ') || 'energetic'}
- Emoji usage: ${voiceProfile.emoji_usage || 'moderate'}
- Language: ${voiceProfile.language_style?.join(', ') || 'english'}
- Include slang: ${voiceProfile.include_slang ? 'yes' : 'no'}
- Avoid cringe hashtags: ${voiceProfile.avoid_cringe_hashtags ? 'yes' : 'no'}
- Use trending hashtags: ${voiceProfile.use_trending_hashtags ? 'yes' : 'no'}
- Include artist name: ${voiceProfile.include_artist_name ? 'yes' : 'no'}
` : '';

  const contentInstructions = {
    title: `Generate 10 optimized titles for ${platform}. ${platformRules[platform as keyof typeof platformRules]}. Return as JSON array: ["title1", "title2", ...]`,
    description: `Generate 10 optimized descriptions for ${platform}. ${platformRules[platform as keyof typeof platformRules]}. Return as JSON array: ["desc1", "desc2", ...]`,
    hashtags: `Generate 15-20 relevant hashtags for ${platform}. ${platformRules[platform as keyof typeof platformRules]}. Return as JSON array: ["#hashtag1", "#hashtag2", ...]`,
    tags: `Generate 10-12 SEO tags for YouTube (comma-separated format). Focus on keywords. Return as JSON array: ["tag1", "tag2", ...]`,
    all: `Generate optimized content for ${platform}:
1. 10 titles (JSON array)
2. 10 descriptions (JSON array)
3. 15-20 hashtags (JSON array, if Instagram/TikTok)
4. 10-12 tags (JSON array, if YouTube)
Return as JSON: {"titles": [...], "descriptions": [...], "hashtags": [...], "tags": [...]}
${platformRules[platform as keyof typeof platformRules]}`
  };

  return `You are an expert social media content creator specializing in ${platform}.

${voiceInstructions}

Content to optimize:
${videoTitle ? `Video Title: ${videoTitle}` : ''}
${videoDescription ? `Description: ${videoDescription}` : ''}
${keywords.length > 0 ? `Keywords: ${keywords.join(', ')}` : ''}

${contentInstructions[contentType as keyof typeof contentInstructions]}

Only return valid JSON, no additional text.`;
}

function parseAIResponse(text: string, contentType: string, platform: string): any {
  try {
    const cleaned = text.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (contentType === 'all') {
      return {
        titles: parsed.titles || [],
        descriptions: parsed.descriptions || [],
        hashtags: parsed.hashtags || [],
        tags: parsed.tags || []
      };
    }

    if (Array.isArray(parsed)) {
      return { [contentType === 'tags' ? 'tags' : contentType === 'hashtags' ? 'hashtags' : contentType + 's']: parsed };
    }

    return parsed;
  } catch {
    const lines = text.split('\n').filter(l => l.trim());
    if (contentType === 'title') {
      return { titles: lines.slice(0, 10) };
    }
    if (contentType === 'description') {
      return { descriptions: lines.slice(0, 10) };
    }
    if (contentType === 'hashtags') {
      const hashtags = lines
        .flatMap(l => l.match(/#\w+/g) || [])
        .slice(0, 20);
      return { hashtags };
    }
    if (contentType === 'tags') {
      return { tags: lines.slice(0, 12) };
    }
    return { error: "Failed to parse response" };
  }
}

