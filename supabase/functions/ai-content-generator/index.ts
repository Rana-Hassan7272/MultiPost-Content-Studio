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
  contentType: 'title' | 'description' | 'hashtags' | 'tags' | 'all' | 'analyze-thumbnail';
  videoTitle?: string;
  videoDescription?: string;
  keywords?: string[];
  voiceProfileId?: string;
  videoThumbnail?: string;
  mediaId?: string;
  videoFileName?: string;
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
    const { userId, platform, contentType, videoTitle, videoDescription, keywords = [], voiceProfileId, videoThumbnail, mediaId, videoFileName } = body;

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

    if (contentType === 'analyze-thumbnail' && videoThumbnail) {
      const thumbnailAnalysis = await analyzeThumbnailForPrediction(videoThumbnail, geminiApiKey);
      return new Response(
        JSON.stringify(thumbnailAnalysis),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const planLimits: Record<string, number> = { free: 20, starter: 200, pro: 1000 };
    const { data: sub } = await supabase.from("subscriptions").select("plan_type, current_period_end").eq("user_id", user.id).eq("status", "active").maybeSingle();
    const planType = sub && (!sub.current_period_end || new Date(sub.current_period_end) >= new Date()) ? sub.plan_type : "free";
    const aiLimit = planLimits[planType] ?? 20;
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const { count } = await supabase.from("ai_content_suggestions").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", startOfMonth);
    if ((count ?? 0) >= aiLimit) {
      return new Response(
        JSON.stringify({ error: `AI limit reached (${aiLimit} per month). Upgrade your plan for more.` }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let videoAnalysis = null;
    let videoAnalysisDetails: any = null;
    if (videoThumbnail) {
      try {
        const analysisResult = await analyzeVideoThumbnail(videoThumbnail, geminiApiKey);
        if (analysisResult) {
          try {
            videoAnalysisDetails = typeof analysisResult === 'string' ? JSON.parse(analysisResult) : analysisResult;
            videoAnalysis = videoAnalysisDetails.analysis || JSON.stringify(videoAnalysisDetails);
          } catch {
            videoAnalysis = analysisResult;
          }
        }
      } catch (error) {
        console.error('Video analysis error:', error);
      }
    }

    let fileNameAnalysis = null;
    if (videoFileName) {
      try {
        fileNameAnalysis = await analyzeFileName(videoFileName, geminiApiKey);
      } catch (error) {
        console.error('Filename analysis error:', error);
      }
    }

    const prompt = buildPrompt(platform, contentType, videoTitle, videoDescription, keywords, voiceProfile, videoAnalysis, videoFileName, fileNameAnalysis, videoAnalysisDetails);

    let musicDetailsForReplace: { artist?: string; songTitle?: string; genre?: string } = {};
    if (fileNameAnalysis) {
      try {
        const parsed = typeof fileNameAnalysis === 'string' ? JSON.parse(fileNameAnalysis) : fileNameAnalysis;
        if (parsed.details) musicDetailsForReplace = { ...musicDetailsForReplace, ...parsed.details };
      } catch (_) {}
    }
    if (videoAnalysisDetails?.details) {
      if (videoAnalysisDetails.details.artist) musicDetailsForReplace.artist = videoAnalysisDetails.details.artist;
      if (videoAnalysisDetails.details.genre) musicDetailsForReplace.genre = videoAnalysisDetails.details.genre;
      if (videoAnalysisDetails.details.songTitle) musicDetailsForReplace.songTitle = videoAnalysisDetails.details.songTitle;
    }

    const cacheKey = `${userId}_${platform}_${contentType}_${videoFileName || 'no_file'}_${videoTitle || 'no_title'}_${voiceProfileId || 'no_profile'}`;
    
    if (contentType !== 'title') {
      const { data: cachedResults } = await supabase
        .from("ai_content_suggestions")
        .select("generated_titles, generated_descriptions, generated_hashtags, generated_tags")
        .eq("user_id", userId)
        .eq("platform", platform)
        .eq("content_type", contentType)
        .eq("voice_profile_id", voiceProfileId || null)
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1);

      if (cachedResults && cachedResults.length > 0) {
        const cachedResult = cachedResults[0];
        let parsed = {
          titles: cachedResult.generated_titles || [],
          descriptions: cachedResult.generated_descriptions || [],
          hashtags: cachedResult.generated_hashtags || [],
          tags: cachedResult.generated_tags || [],
        };
        
        const hasPlaceholders = JSON.stringify(parsed).includes('[Artist Name]') || 
                               JSON.stringify(parsed).includes('[Song Title]') || 
                               JSON.stringify(parsed).includes('[Genre]') ||
                               JSON.stringify(parsed).match(/\[.*?\]/);
        
        if (!hasPlaceholders) {
          if (contentType === 'all') {
            return new Response(
              JSON.stringify(parsed),
              { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" } }
            );
          } else {
            const key = contentType === 'tags' ? 'tags' : contentType === 'hashtags' ? 'hashtags' : contentType + 's';
            return new Response(
              JSON.stringify({ [key]: parsed[key as keyof typeof parsed] || [] }),
              { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" } }
            );
          }
        }
      }
    } else {
      console.log('Title generation - skipping cache to ensure fresh, context-aware titles');
    }

    const modelName = "gemini-2.5-flash-lite";
    const apiVersion = "v1beta";
    
    const requestBody: any = {
      contents: [{
        parts: [{ text: prompt }]
      }]
    };

    if (videoThumbnail) {
      const base64Data = videoThumbnail.replace(/^data:image\/\w+;base64,/, '');
      requestBody.contents[0].parts.push({
        inline_data: {
          mime_type: "image/jpeg",
          data: base64Data
        }
      });
    }
    
    let response = await fetch(
      `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelName}:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini API error with ${modelName}:`, errorText);
      
      const fallbackModel = "gemini-2.5-flash-lite";
      console.log(`Trying fallback model: ${fallbackModel}`);
      
      response = await fetch(
        `https://generativelanguage.googleapis.com/${apiVersion}/models/${fallbackModel}:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        }
      );
      
      if (!response.ok) {
        const fallbackError = await response.text();
        throw new Error(`Gemini API error: ${fallbackError}`);
      }
    }

    const data = await response.json();
    let generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (generatedText.includes('[Artist Name]') || generatedText.includes('[Song Title]') || generatedText.includes('[Genre]')) {
      console.warn('AI generated placeholders - filtering them out');
      generatedText = generatedText
        .replace(/\[Artist Name\]/g, musicDetailsForReplace?.artist || '')
        .replace(/\[Song Title\]/g, musicDetailsForReplace?.songTitle || '')
        .replace(/\[Genre\]/g, musicDetailsForReplace?.genre || '')
        .replace(/\[.*?\]/g, '');
    }

    const parsed = parseAIResponse(generatedText, contentType, platform);

    const hasPlaceholdersInResult = JSON.stringify(parsed).includes('[Artist Name]') || 
                                   JSON.stringify(parsed).includes('[Song Title]') || 
                                   JSON.stringify(parsed).includes('[Genre]');
    
    if (hasPlaceholdersInResult) {
      console.error('WARNING: Generated content still contains placeholders after cleaning!', parsed);
    }

    await supabase.from("ai_content_suggestions").insert({
      user_id: userId,
      platform,
      content_type: contentType,
      generated_titles: parsed.titles || [],
      generated_descriptions: parsed.descriptions || [],
      generated_hashtags: parsed.hashtags || [],
      generated_tags: parsed.tags || [],
      voice_profile_id: voiceProfileId || null,
      confidence_score: 0.85,
    });

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

function isUninformativeFileName(fileName: string): boolean {
  if (!fileName || fileName.length < 3) return true;
  const base = fileName.replace(/\.[^.]+$/, '').trim();
  if (base.length < 2) return true;
  const lower = base.toLowerCase();
  if (/^\d{4}[-\s_]?\d{2}[-\s_]?\d{2}([-\s_]?\d{2}[-\s_]?\d{2}([-\s_]?\d{2})?)?$/.test(base)) return true;
  if (/^\d{2}[-\s_]?\d{2}[-\s_]?\d{2}([-\s_]?\d{2}[-\s_]?\d{2})?$/.test(base)) return true;
  if (/^img[_\-]?\d+$/i.test(base)) return true;
  if (/^vid[eo]?[_\-]?\d+$/i.test(base)) return true;
  if (/^recording[_\-]?\d*$/i.test(base)) return true;
  if (/^screen[_\-]?recording$/i.test(base)) return true;
  if (/^\d+$/.test(base)) return true;
  if (lower === 'video' || lower === 'movie' || lower === 'clip' || lower === 'untitled') return true;
  return false;
}

async function analyzeFileName(fileName: string, apiKey: string): Promise<string | null> {
  if (isUninformativeFileName(fileName)) {
    return null;
  }
  try {
    const modelName = "gemini-2.5-flash-lite";
    const apiVersion = "v1beta";
    
    const prompt = `Analyze this video filename carefully: "${fileName}"

This is a MUSIC app, so most content will be music-related. Analyze the filename and determine:

1. Content Type: Is this music-related (song, music video, track, beat, artist performance, etc.) OR non-music (coding tutorial, website demo, tech video, etc.)?
2. If MUSIC: Identify:
   - Artist name (if mentioned)
   - Song/track title (if mentioned)
   - Music genre (HipHop, Pop, Rap, R&B, Electronic, Rock, etc.)
   - Type of music content (official music video, live performance, behind-the-scenes, music production, beat making, etc.)
   - Mood/energy level (upbeat, chill, energetic, emotional, etc.)
3. If NON-MUSIC: Identify the exact topic (coding, website, tutorial, etc.)

Return a concise JSON object with this structure:
{
  "contentType": "music" or "non-music",
  "details": {
    "artist": "artist name if detected",
    "songTitle": "song title if detected",
    "genre": "music genre if music",
    "contentType": "specific type (music video, live performance, coding tutorial, etc.)",
    "mood": "mood/energy if music",
    "topic": "main topic description"
  },
  "analysis": "brief 2-3 sentence analysis of what this content likely is"
}

Be intelligent and context-aware. For example:
- "drake_hotline_bling.mp4" → music, artist: Drake, song: Hotline Bling, genre: HipHop/Rap
- "amazon_clone_tutorial.mp4" → non-music, topic: coding tutorial
- "summer_vibes_2024.mp4" → music, genre: likely Pop/Electronic, mood: upbeat
- "my_new_track.mp4" → music, type: original track
- "behind_scenes_recording.mp4" → music, type: behind-the-scenes music content

Return ONLY valid JSON, no additional text.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelName}:generateContent?key=${apiKey}`,
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
      const errorText = await response.text();
      console.error('Filename analysis API error:', errorText);
      return null;
    }

    const data = await response.json();
    const analysisText = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    
    if (analysisText) {
      try {
        const cleaned = analysisText.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        console.log('Filename analysis result:', parsed);
        return JSON.stringify(parsed);
      } catch {
        console.log('Filename analysis (raw):', analysisText);
        return analysisText;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Filename analysis error:', error);
    return null;
  }
}

async function analyzeThumbnailForPrediction(thumbnailBase64: string, apiKey: string): Promise<{ thumbnailScore: number; thumbnailTips: string[] }> {
  try {
    const base64Data = thumbnailBase64.replace(/^data:image\/\w+;base64,/, '');
    const modelName = "gemini-2.5-flash-lite";
    const apiVersion = "v1beta";
    
    const prompt = `You are a YouTube thumbnail expert. Analyze this thumbnail for click-through rate potential.

Score the thumbnail on these criteria (0-100 each):

1. FACE PRESENCE (faces get 2-3x more clicks)
   - Human face clearly visible? Emotional expression?
   
2. TEXT READABILITY
   - Is there text overlay? Is it readable at small sizes?
   - Good contrast? Not too much text?
   
3. COLOR & CONTRAST
   - High contrast colors? Stands out from YouTube's white/red interface?
   - Vibrant, eye-catching colors?
   
4. COMPOSITION
   - Clear focal point? Not cluttered?
   - Rule of thirds? Good framing?
   
5. EMOTION/CURIOSITY
   - Does it evoke emotion or curiosity?
   - Would you click on this?

Return ONLY valid JSON:
{
  "faceScore": 0-100,
  "textScore": 0-100,
  "colorScore": 0-100,
  "compositionScore": 0-100,
  "emotionScore": 0-100,
  "overallScore": 0-100,
  "tips": ["specific tip 1", "specific tip 2"]
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: "image/jpeg", data: base64Data } }
            ],
          }],
        })
      }
    );

    if (!response.ok) {
      console.error('Gemini API error for thumbnail prediction');
      return { thumbnailScore: 60, thumbnailTips: ['Unable to analyze thumbnail'] };
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        thumbnailScore: parsed.overallScore || 60,
        thumbnailTips: parsed.tips || []
      };
    }
    
    return { thumbnailScore: 60, thumbnailTips: [] };
  } catch (error) {
    console.error('Thumbnail prediction analysis failed:', error);
    return { thumbnailScore: 60, thumbnailTips: ['Thumbnail analysis unavailable'] };
  }
}

async function analyzeVideoThumbnail(thumbnailBase64: string, apiKey: string): Promise<string | null> {
  try {
    const base64Data = thumbnailBase64.replace(/^data:image\/\w+;base64,/, '');
    const modelName = "gemini-2.5-flash-lite";
    const apiVersion = "v1beta";
    
    const prompt = `Analyze this image with EXTREME DETAIL and ACCURACY. It may be a VIDEO FRAME/THUMBNAIL or a STANDALONE PHOTO (e.g. Instagram post, artwork). This is for a MUSIC app, but be accurate - don't assume it's music unless you see music-related content.

Analyze and identify:

1. EXACT Content Type:
   - Is this a music video? (artist performing, music studio, recording, concert, etc.)
   - Is this a film/short film? (narrative story, movie scene, cinematic)
   - Is this a coding/tech video? (code on screen, website, tutorial)
   - Is this something else? (be specific)

2. If MUSIC VIDEO, identify:
   - Artist/Performer visible (name, appearance, style)
   - Music genre/style visible (HipHop, Pop, Rock, Electronic, etc.)
   - Setting (studio, concert, street, club, etc.)
   - Visual style (dark, colorful, cinematic, raw, etc.)
   - Mood/atmosphere (energetic, emotional, chill, intense, etc.)
   - Any text visible (song titles, artist names, lyrics, etc.)
   - Instruments or equipment visible
   - Number of people (solo artist, group, band, etc.)

3. If FILM/SHORT FILM, identify:
   - Genre (drama, comedy, action, horror, etc.)
   - Setting/location
   - Visual style
   - Mood/atmosphere
   - Any text visible (titles, credits, etc.)

4. If CODING/TECH, identify:
   - Exact topic (website, app, tutorial, etc.)
   - Technology visible
   - What's on screen

5. Visual Details:
   - Colors dominant in frame
   - Lighting (bright, dark, moody, etc.)
   - Composition (close-up, wide shot, etc.)
   - Any text visible (read it exactly)
   - Objects/people visible

Return a detailed JSON object:
{
  "contentType": "music-video" | "film-short" | "coding-tech" | "photo-image" | "other",
  "details": {
    "artist": "artist name if visible",
    "genre": "music genre if music",
    "setting": "where the video takes place",
    "visualStyle": "visual aesthetic/style",
    "mood": "mood/atmosphere",
    "textVisible": "any text visible on screen",
    "description": "detailed description of what's actually visible"
  },
  "analysis": "2-3 sentence detailed analysis of the actual video content"
}

Be SPECIFIC and ACCURATE. Describe what you ACTUALLY see, not assumptions.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: prompt
              },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: base64Data
                }
              }
            ]
          }]
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Video analysis API error:', errorText);
      return null;
    }

    const data = await response.json();
    const analysisText = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    
    if (analysisText) {
      try {
        const cleaned = analysisText.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        console.log('Video analysis result:', parsed);
        return JSON.stringify(parsed);
      } catch {
        console.log('Video analysis (raw):', analysisText);
        return analysisText;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Thumbnail analysis error:', error);
    return null;
  }
}

function buildPrompt(
  platform: string,
  contentType: string,
  videoTitle?: string,
  videoDescription?: string,
  keywords: string[] = [],
  voiceProfile: any = null,
  videoAnalysis: string | null = null,
  videoFileName?: string,
  fileNameAnalysis: string | null = null,
  videoAnalysisDetails: any = null,
  filenameUninformative: boolean = false
): string {
  const platformRules = {
    youtube: "YouTube: Focus on SEO, include keywords, 60-100 characters for titles, detailed descriptions up to 5000 chars. Use comma-separated tags.",
    instagram: "Instagram: Engaging captions up to 2200 chars, use hashtags (10-30 hashtags), emoji-friendly, trending hashtags.",
    tiktok: "TikTok: Short punchy captions (up to 2200 chars), trending hashtags (#FYP, #ForYou, #Viral), Gen-Z language, viral hooks."
  };

  const voiceInstructions = voiceProfile ? `
🎯 VOICE PROFILE SETTINGS (MUST FOLLOW THESE EXACTLY):

Tone & Style:
- Tone Style: ${voiceProfile.tone_style?.join(', ') || 'energetic'} - Use this EXACT tone in all content
- Language Style: ${voiceProfile.language_style?.join(', ') || 'english'} - Match this language style

Content Preferences:
- Emoji Usage: ${voiceProfile.emoji_usage || 'moderate'} - ${voiceProfile.emoji_usage === 'high' ? 'Use emojis frequently (2-4 per title/description)' : voiceProfile.emoji_usage === 'low' ? 'Use emojis sparingly (0-1 per title/description)' : 'Use emojis moderately (1-2 per title/description)'}
- Include Slang: ${voiceProfile.include_slang ? 'YES - Use modern slang, Gen-Z language, and casual expressions' : 'NO - Use formal, professional language'}
- Avoid Cringe Hashtags: ${voiceProfile.avoid_cringe_hashtags ? 'YES - Avoid overused hashtags like #FYP, #Viral, #Trending (unless specifically requested)' : 'NO - Use any trending hashtags'}
- Use Trending Hashtags: ${voiceProfile.use_trending_hashtags ? 'YES - Include current trending hashtags relevant to the content' : 'NO - Focus on niche, specific hashtags'}
- Include Artist Name: ${voiceProfile.include_artist_name ? 'YES - Include artist name when available' : 'NO - Focus on song/content, not artist name'}
${voiceProfile.content_focus ? `- Content Focus: "${voiceProfile.content_focus}" - User mainly posts this type of content. Keep suggestions aligned with this focus.\n` : ''}${(voiceProfile.preferred_genres && Array.isArray(voiceProfile.preferred_genres) && voiceProfile.preferred_genres.length > 0) ? `- Preferred Genres: ${voiceProfile.preferred_genres.join(', ')} - Favor these genres in titles, descriptions, and hashtags.\n` : ''}

CRITICAL: All generated content MUST match these voice profile settings. The tone, emoji usage, language style, and hashtag preferences MUST be reflected in every suggestion.
` : '';

  const isImprovement = videoTitle?.includes('IMPROVE THIS') || videoDescription?.includes('IMPROVE THIS');
  
  const improvementGuidance = isImprovement 
    ? `\n\nIMPROVEMENT MODE: The user wants to OPTIMIZE existing content. Make it MORE VIRAL, MORE ENGAGING, MORE IMPRESSIVE. Add powerful hooks, emotional triggers, trending elements, curiosity gaps. Make users WANT to watch/listen. For music: emphasize the energy, artist impact, and make it share-worthy.\n`
    : '';
  
  const placeholderBan = `\n\n🚫 ABSOLUTE FORBIDDEN - DO NOT USE THESE PLACEHOLDERS:
- "[Artist Name]" - FORBIDDEN
- "[Song Title]" - FORBIDDEN  
- "[Genre]" - FORBIDDEN
- Any text in square brackets [ ] - FORBIDDEN
- Generic templates - FORBIDDEN

IF artist/song detected: Use the ACTUAL names from context above
IF no artist/song detected: Create creative, unique content WITHOUT placeholders
EVERY suggestion must be COMPLETE and READY TO USE - no brackets, no placeholders\n`;

  const voiceProfileNote = voiceProfile 
    ? `\n\n🎯 REMEMBER: Apply voice profile settings to ALL content:\n- Tone: ${voiceProfile.tone_style?.join(', ') || 'energetic'}\n- Emoji: ${voiceProfile.emoji_usage || 'moderate'}\n- Language: ${voiceProfile.language_style?.join(', ') || 'english'}\n- Slang: ${voiceProfile.include_slang ? 'YES' : 'NO'}\n- Cringe hashtags: ${voiceProfile.avoid_cringe_hashtags ? 'AVOID' : 'OK'}\n- Trending hashtags: ${voiceProfile.use_trending_hashtags ? 'USE' : 'AVOID'}\n- Artist name: ${voiceProfile.include_artist_name ? 'INCLUDE' : 'AVOID'}\n`
    : '';

  const contentInstructions = {
    title: isImprovement 
      ? `The user provided an existing title and wants IMPROVED versions. Generate 10 UNIQUE, OPTIMIZED, MORE VIRAL titles. Each must be DIFFERENT and CREATIVE - no templates or placeholders.${placeholderBan}${voiceProfileNote}Make them impressive, attention-grabbing, and optimized for ${platform}.${improvementGuidance}Return as JSON array: ["improved_title1", "improved_title2", ...]`
      : `Generate 10 UNIQUE, CREATIVE, viral-worthy titles for ${platform}. Each title must be DIFFERENT and COMPLETE - no placeholders, no brackets, no templates.${placeholderBan}${voiceProfileNote}${platformRules[platform as keyof typeof platformRules]}. Make them engaging, impressive, and share-worthy. Use actual detected information from context above OR create unique creative content. Return as JSON array: ["title1", "title2", ...]`,
    description: isImprovement
      ? `The user provided an existing description and wants IMPROVED versions. Generate 10 UNIQUE, OPTIMIZED, MORE ENGAGING descriptions. Each must be DIFFERENT and CREATIVE - no templates, no placeholders.${placeholderBan}${voiceProfileNote}Make them compelling, viral-worthy, and optimized for ${platform}.${improvementGuidance}Return as JSON array: ["improved_desc1", "improved_desc2", ...]`
      : `Generate 10 UNIQUE, CREATIVE descriptions for ${platform}. Each description must be DIFFERENT and COMPLETE - no placeholders, no brackets, no templates.${placeholderBan}${voiceProfileNote}${platformRules[platform as keyof typeof platformRules]}. Make them engaging, impressive, and share-worthy. Use actual detected information from context above OR create unique creative content. Return as JSON array: ["desc1", "desc2", ...]`,
    hashtags: `Generate 15-20 UNIQUE, relevant hashtags for ${platform}. Each must be different.${placeholderBan}${voiceProfileNote}${voiceProfile?.avoid_cringe_hashtags ? 'AVOID cringe hashtags like #FYP, #Viral, #Trending - use niche, specific hashtags instead. ' : ''}${voiceProfile?.use_trending_hashtags ? 'Include current trending hashtags. ' : 'Focus on niche, specific hashtags. '}${platformRules[platform as keyof typeof platformRules]}. Return as JSON array: ["#hashtag1", "#hashtag2", ...]`,
    tags: `Generate 10-12 UNIQUE SEO tags for YouTube (comma-separated format). Focus on keywords.${placeholderBan}${voiceProfileNote}Return as JSON array: ["tag1", "tag2", ...]`,
    all: `Generate optimized, viral-worthy content for ${platform}. Each suggestion must be UNIQUE, DIFFERENT, and COMPLETE - no placeholders, no brackets.${placeholderBan}${voiceProfileNote}
1. 10 UNIQUE titles (JSON array) - each different, engaging, impressive, and share-worthy - COMPLETE titles ready to use
2. 10 UNIQUE descriptions (JSON array) - each different, compelling and viral-worthy - COMPLETE descriptions ready to use
3. 15-20 UNIQUE hashtags (JSON array, if Instagram/TikTok)${voiceProfile?.avoid_cringe_hashtags ? ' - AVOID cringe hashtags' : ''}${voiceProfile?.use_trending_hashtags ? ' - Include trending hashtags' : ''}
4. 10-12 UNIQUE tags (JSON array, if YouTube)
Use actual detected information from context above OR create unique creative content. Return as JSON: {"titles": [...], "descriptions": [...], "hashtags": [...], "tags": [...]}
${platformRules[platform as keyof typeof platformRules]}`
  };

  let contentContext = '';
  let isNonMusicContent = false;
  let detectedTopic = 'music';
  let musicDetails: any = null;
  
  if (fileNameAnalysis) {
    try {
      const parsed = typeof fileNameAnalysis === 'string' ? JSON.parse(fileNameAnalysis) : fileNameAnalysis;
      console.log('Parsed filename analysis:', parsed);
      
      if (parsed.contentType === 'non-music') {
        isNonMusicContent = true;
        detectedTopic = parsed.details?.topic || 'non-music';
        contentContext += `⚠️ NON-MUSIC CONTENT DETECTED FROM FILENAME: "${videoFileName}"\n`;
        contentContext += `Content Type: ${parsed.contentType}\n`;
        contentContext += `Topic: ${parsed.details?.topic || 'Unknown'}\n`;
        contentContext += `Analysis: ${parsed.analysis || ''}\n\n`;
        contentContext += `CRITICAL: Generate ${detectedTopic}-related content, NOT music content.\n\n`;
      } else {
        detectedTopic = 'music';
        musicDetails = parsed.details || {};
        contentContext += `✅ MUSIC CONTENT DETECTED FROM FILENAME: "${videoFileName}"\n`;
        contentContext += `Content Type: MUSIC\n`;
        if (musicDetails.artist) {
          contentContext += `🎤 Artist: "${musicDetails.artist}" - USE THIS EXACT NAME in titles/descriptions\n`;
        }
        if (musicDetails.songTitle) {
          contentContext += `🎵 Song/Track: "${musicDetails.songTitle}" - USE THIS EXACT TITLE in titles/descriptions\n`;
        }
        if (musicDetails.genre) {
          contentContext += `🎶 Genre: ${musicDetails.genre} - Use ${musicDetails.genre}-specific language and hashtags\n`;
        }
        if (musicDetails.contentType) {
          contentContext += `📹 Type: ${musicDetails.contentType}\n`;
        }
        if (musicDetails.mood) {
          contentContext += `⚡ Mood/Energy: ${musicDetails.mood}\n`;
        }
        contentContext += `Analysis: ${parsed.analysis || ''}\n\n`;
      }
    } catch (error) {
      console.error('Error parsing filename analysis:', error);
      contentContext += `FILENAME: "${videoFileName}"\n\n`;
    }
  } else if (videoFileName) {
    if (filenameUninformative) {
      contentContext += `⚠️ FILENAME IS NOT DESCRIPTIVE: "${videoFileName}" looks like a date/timestamp or generic name.\n`;
      contentContext += `IGNORE the filename for content ideas. Base your titles and descriptions ONLY on the VIDEO FRAME ANALYSIS (the image) below—describe what you actually see in the video.\n\n`;
    } else {
      contentContext += `FILENAME: "${videoFileName}"\n\n`;
    }
  }
  
  if (videoAnalysisDetails) {
    const videoType = videoAnalysisDetails.contentType || '';
    const details = videoAnalysisDetails.details || {};
    
    if (videoType === 'coding-tech' || videoType === 'other') {
      isNonMusicContent = true;
      detectedTopic = details.topic || 'non-music';
      contentContext += `⚠️ VIDEO CONTENT ANALYSIS (PRIMARY SOURCE - FROM ACTUAL VIDEO FRAME):\n`;
      contentContext += `Content Type: ${videoType}\n`;
      if (details.description) contentContext += `What's Visible: ${details.description}\n`;
      if (details.textVisible) contentContext += `Text on Screen: ${details.textVisible}\n`;
      if (videoAnalysisDetails.analysis) contentContext += `Analysis: ${videoAnalysisDetails.analysis}\n`;
      contentContext += `\nCRITICAL: Generate ${detectedTopic}-related content, NOT music content.\n\n`;
    } else if (videoType === 'music-video') {
      detectedTopic = 'music';
      contentContext += `✅ VIDEO CONTENT ANALYSIS (PRIMARY SOURCE - FROM ACTUAL VIDEO FRAME):\n`;
      contentContext += `Content Type: MUSIC VIDEO\n`;
      if (details.artist) {
        contentContext += `🎤 Artist Visible: "${details.artist}" - USE THIS EXACT NAME\n`;
        musicDetails = musicDetails || {};
        musicDetails.artist = details.artist;
      }
      if (details.genre) {
        contentContext += `🎶 Genre: ${details.genre} - Use ${details.genre}-specific language\n`;
        musicDetails = musicDetails || {};
        musicDetails.genre = details.genre;
      }
      if (details.setting) contentContext += `📍 Setting: ${details.setting}\n`;
      if (details.visualStyle) contentContext += `🎨 Visual Style: ${details.visualStyle}\n`;
      if (details.mood) {
        contentContext += `⚡ Mood/Atmosphere: ${details.mood} - Match this exact mood\n`;
        musicDetails = musicDetails || {};
        musicDetails.mood = details.mood;
      }
      if (details.textVisible) contentContext += `📝 Text Visible: "${details.textVisible}" - Reference this if relevant\n`;
      if (details.description) contentContext += `📹 What's Visible: ${details.description}\n`;
      if (videoAnalysisDetails.analysis) contentContext += `Analysis: ${videoAnalysisDetails.analysis}\n`;
      contentContext += `\nCRITICAL: Generate content SPECIFIC to what's ACTUALLY in this video.\n\n`;
    } else if (videoType === 'film-short') {
      isNonMusicContent = true;
      detectedTopic = 'film-short';
      contentContext += `🎬 VIDEO CONTENT ANALYSIS (PRIMARY SOURCE - FROM ACTUAL VIDEO FRAME):\n`;
      contentContext += `Content Type: FILM/SHORT FILM\n`;
      if (details.genre) contentContext += `Genre: ${details.genre}\n`;
      if (details.setting) contentContext += `Setting: ${details.setting}\n`;
      if (details.visualStyle) contentContext += `Visual Style: ${details.visualStyle}\n`;
      if (details.mood) contentContext += `Mood: ${details.mood}\n`;
      if (details.description) contentContext += `What's Visible: ${details.description}\n`;
      if (videoAnalysisDetails.analysis) contentContext += `Analysis: ${videoAnalysisDetails.analysis}\n`;
      contentContext += `\nCRITICAL: Generate film/short film content, NOT music content.\n\n`;
    } else if (videoType === 'photo-image') {
      contentContext += `🖼️ IMAGE CONTENT ANALYSIS (PRIMARY SOURCE - FROM THE PHOTO/IMAGE):\n`;
      contentContext += `Content Type: PHOTO / STANDALONE IMAGE (e.g. Instagram post)\n`;
      if (details.description) contentContext += `What's Visible: ${details.description}\n`;
      if (details.textVisible) contentContext += `Text Visible: "${details.textVisible}"\n`;
      if (details.visualStyle) contentContext += `Visual Style: ${details.visualStyle}\n`;
      if (details.mood) contentContext += `Mood: ${details.mood}\n`;
      if (details.setting) contentContext += `Setting: ${details.setting}\n`;
      if (details.genre) contentContext += `Genre/Style: ${details.genre}\n`;
      if (details.artist) contentContext += `Artist/Subject: ${details.artist}\n`;
      if (videoAnalysisDetails.analysis) contentContext += `Analysis: ${videoAnalysisDetails.analysis}\n`;
      contentContext += `\nCRITICAL: Generate titles, descriptions, and hashtags SPECIFIC to what's ACTUALLY in this image. Match the mood, style, and content.\n\n`;
    } else if (videoAnalysis) {
      contentContext += `VIDEO FRAME ANALYSIS: ${videoAnalysis}\n\n`;
    }
  } else if (videoAnalysis) {
    const analysisLower = videoAnalysis.toLowerCase();
    if (analysisLower.includes('code') || analysisLower.includes('website') || analysisLower.includes('clone') || analysisLower.includes('development') || analysisLower.includes('tutorial') || analysisLower.includes('programming') || analysisLower.includes('interface') || analysisLower.includes('screen') || analysisLower.includes('computer') || analysisLower.includes('coding')) {
      isNonMusicContent = true;
      detectedTopic = 'coding/tech';
      contentContext += `⚠️ VIDEO FRAME ANALYSIS: ${videoAnalysis}\n\n`;
      contentContext += `DETECTED: This is CODING/TECH content.\n`;
      contentContext += `CRITICAL: Generate tech/coding content, NOT music content.\n\n`;
    } else if (analysisLower.includes('music') || analysisLower.includes('song') || analysisLower.includes('artist') || analysisLower.includes('audio') || analysisLower.includes('instrument') || analysisLower.includes('singer') || analysisLower.includes('beat') || analysisLower.includes('performance') || analysisLower.includes('recording') || analysisLower.includes('studio')) {
      detectedTopic = 'music';
      contentContext += `✅ VIDEO FRAME ANALYSIS: ${videoAnalysis}\n\n`;
      contentContext += `DETECTED: This is MUSIC content.\n\n`;
    } else {
      contentContext += `VIDEO FRAME ANALYSIS: ${videoAnalysis}\n\n`;
    }
  }
  
  if (videoTitle) {
    contentContext += `User-provided Title: ${videoTitle}\n`;
  }
  if (videoDescription) {
    contentContext += `User-provided Description: ${videoDescription}\n`;
  }
  if (keywords.length > 0) {
    contentContext += `Keywords: ${keywords.join(', ')}\n`;
  }
  
  if (!contentContext.trim()) {
    contentContext = `No specific content provided. This is a MUSIC app - generate music-related content.\n`;
    detectedTopic = 'music';
  }

  const topicInstruction = isNonMusicContent 
    ? `IMPORTANT: This video is ${detectedTopic} content, NOT music. Generate ${detectedTopic}-related titles/descriptions.`
    : musicDetails && Object.keys(musicDetails).length > 0
    ? `MUSIC CONTENT DETECTED: Generate content relevant to ${musicDetails.artist ? `artist "${musicDetails.artist}"` : 'this artist'}, ${musicDetails.songTitle ? `song "${musicDetails.songTitle}"` : 'this track'}, ${musicDetails.genre ? `genre ${musicDetails.genre}` : 'this music genre'}, ${musicDetails.mood ? `mood: ${musicDetails.mood}` : ''}. Make it specific and relevant to this music content.`
    : `DEFAULT: This is a MUSIC app. Generate music-related content (songs, artists, music videos, tracks, beats, music production, etc.).`;

  const videoSpecificGuidance = videoAnalysisDetails && videoAnalysisDetails.details
    ? `\n\n🎯 VIDEO-SPECIFIC CONTEXT (MOST IMPORTANT - FROM ACTUAL VIDEO FRAME):
${videoAnalysisDetails.details.description ? `- What's Actually Visible: ${videoAnalysisDetails.details.description}\n` : ''}
${videoAnalysisDetails.details.visualStyle ? `- Visual Style: ${videoAnalysisDetails.details.visualStyle} - Match this aesthetic in your content\n` : ''}
${videoAnalysisDetails.details.mood ? `- Mood/Atmosphere: ${videoAnalysisDetails.details.mood} - Match this exact mood and energy\n` : ''}
${videoAnalysisDetails.details.setting ? `- Setting: ${videoAnalysisDetails.details.setting} - Reference this location/context\n` : ''}
${videoAnalysisDetails.details.textVisible ? `- Text Visible: "${videoAnalysisDetails.details.textVisible}" - Use this if it's a song title, artist name, or relevant text\n` : ''}
CRITICAL: Generate content that is SPECIFIC to what's ACTUALLY in this video. Make it feel like it was written specifically for THIS video, not a generic template.\n`
    : '';

  const musicSpecificGuidance = musicDetails && Object.keys(musicDetails).length > 0
    ? `\n\nCRITICAL - USE ACTUAL DETECTED INFORMATION (DO NOT USE PLACEHOLDERS):
${musicDetails.artist ? `- REAL Artist Name: "${musicDetails.artist}" - USE THIS EXACT NAME in titles/descriptions, NOT "[Artist Name]" placeholder\n` : '- No artist detected - create engaging content without artist name placeholders\n'}
${musicDetails.songTitle ? `- REAL Song/Track: "${musicDetails.songTitle}" - USE THIS EXACT TITLE, NOT "[Song Title]" placeholder\n` : '- No song title detected - create engaging content without song title placeholders\n'}
${musicDetails.genre ? `- Genre: ${musicDetails.genre} - Use ${musicDetails.genre}-specific hashtags and language (e.g., ${musicDetails.genre === 'HipHop' || musicDetails.genre === 'Rap' ? '#HipHop #Rap #NewMusic #Trap' : musicDetails.genre === 'Pop' ? '#Pop #PopMusic #NewMusic #Top40' : musicDetails.genre === 'R&B' ? '#RnB #RB #NewMusic #Soul' : `#${musicDetails.genre} #NewMusic`})\n` : '- Use general music hashtags: #NewMusic #Music #Viral\n'}
${musicDetails.contentType ? `- Content Type: ${musicDetails.contentType} - Tailor for this specific type\n` : ''}
${musicDetails.mood ? `- Mood/Energy: ${musicDetails.mood} - Match this exact mood in your content tone\n` : ''}
`
    : '';

  const antiTemplateRule = `\n\n🚫 CRITICAL RULES - STRICTLY ENFORCED:

1. ABSOLUTE BAN ON PLACEHOLDERS:
   - "[Artist Name]" = FORBIDDEN - Use actual artist name OR create content without it
   - "[Song Title]" = FORBIDDEN - Use actual song title OR create content without it
   - "[Genre]" = FORBIDDEN - Use actual genre name OR create content without it
   - ANY text in square brackets [ ] = FORBIDDEN
   - Generic templates = FORBIDDEN

2. IF ARTIST/SONG DETECTED:
   - Use the EXACT names from context above (e.g., if "Drake" detected, use "Drake", not "[Artist Name]")
   - If "Hotline Bling" detected, use "Hotline Bling", not "[Song Title]"

3. IF NO ARTIST/SONG DETECTED:
   - Create creative, unique content WITHOUT any placeholders
   - Examples: "New Music Drop! 🔥 Watch Now! #NewMusic" (NOT "[Artist Name] - [Song Title]")
   - Be creative and specific to the video's actual content

4. EVERY SUGGESTION MUST BE:
   - COMPLETE and READY TO USE immediately
   - UNIQUE and DIFFERENT from others
   - SPECIFIC to the actual video content
   - NO brackets, NO placeholders, NO templates

5. CONTEXT-AWARE:
   - Match the video's visual style, mood, and atmosphere
   - Generate content that makes user think "YES, this is exactly what I should add for THIS video"

6. EXAMPLES OF FORBIDDEN (DO NOT GENERATE):
   - ❌ "[Artist Name] - [Song Title]"
   - ❌ "NEW MUSIC from [Artist Name]!"
   - ❌ "[Genre] vibes incoming"

7. EXAMPLES OF CORRECT (GENERATE LIKE THIS):
   - ✅ "New Music Drop! 🔥 Watch Now! #NewMusic"
   - ✅ "This Track is INSANE! 🚨 You Need to Hear This! #ViralMusic"
   - ✅ "Fresh Beats Just Dropped! 🎵 Don't Miss Out! #NewMusicFriday"
   - ✅ If artist detected: "Drake's New Track is FIRE! 🔥 Official Video! #HipHop"
   - ✅ If song detected: "Hotline Bling Official Video! 🎵 Watch Now! #NewMusic"\n`;

  return `You are an expert social media content creator specializing in ${platform} for MUSIC content.

⚠️ RELEVANCE RULE (HIGHEST PRIORITY):
- Generated content MUST match what is actually in the video. Use the VIDEO CONTENT ANALYSIS and FILENAME ANALYSIS below as the source of truth.
${filenameUninformative && videoAnalysisDetails ? `- The filename does NOT describe the content (it is a date/timestamp). You MUST base ALL suggestions on the VIDEO FRAME (image) provided—analyze what you see (people, setting, mood, text on screen, genre) and generate titles/descriptions that fit THAT content. Do not make up generic timestamp or "recording" titles.` : ''}
- If the video is a SONG / MUSIC VIDEO: generate ONLY music-related titles and descriptions (song title, artist, genre, music vibe). NEVER generate unrelated topics (e.g. food, cooking, tech, travel) for a music video.
- If the video is NON-MUSIC (e.g. coding, vlog): generate content for that topic only. Do not suggest music titles for a coding tutorial.
- Give the user ideas that fit THIS video and exceed expectations (e.g. for a song video: titles that best suit the song, mood, and genre—not generic or off-topic suggestions).
- Every suggestion must feel like it was written specifically for THIS video.

${voiceInstructions}

Content Context:
${contentContext}${videoSpecificGuidance}${musicSpecificGuidance}${antiTemplateRule}

CONTENT GENERATION RULES (THIS IS A MUSIC APP):
1. ${topicInstruction}
2. Only generate ${detectedTopic === 'coding/tech' || detectedTopic === 'film-short' ? detectedTopic : 'music'}-related content
3. PRIMARY SOURCE: Use VIDEO CONTENT ANALYSIS as the PRIMARY source - generate content SPECIFIC to what's ACTUALLY visible in the video
4. CONTEXT-AWARE: Every video is unique - analyze the specific visual style, mood, setting, and content visible in THIS video
5. Make content VIRAL, ENGAGING, and IMPRESSIVE - use powerful hooks, emotional triggers, trending elements, curiosity gaps
6. ${voiceProfile ? '🎯 VOICE PROFILE INTEGRATION: Apply voice profile settings to ALL content - tone, emoji usage, language style, slang, hashtag preferences MUST be reflected in every suggestion' : ''}
7. For music content: 
   ${musicDetails?.artist ? `- USE ACTUAL ARTIST NAME "${musicDetails.artist}" - DO NOT use "[Artist Name]" placeholder\n   ` : '- Create engaging titles WITHOUT artist placeholders - be creative and unique\n   '}${musicDetails?.songTitle ? `- USE ACTUAL SONG "${musicDetails.songTitle}" - DO NOT use "[Song Title]" placeholder\n   ` : '- Create engaging titles WITHOUT song placeholders - be creative and unique\n   '}${musicDetails?.genre ? `- Use ${musicDetails.genre}-specific hashtags and authentic language\n   ` : '- Use diverse music hashtags\n   '}${videoAnalysisDetails?.details?.mood ? `- Match the ${videoAnalysisDetails.details.mood} mood/atmosphere from the video\n   ` : musicDetails?.mood ? `- Match the ${musicDetails.mood} mood/energy\n   ` : ''}${videoAnalysisDetails?.details?.visualStyle ? `- Match the ${videoAnalysisDetails.details.visualStyle} visual style in your content\n   ` : ''}${voiceProfile?.include_artist_name === false && musicDetails?.artist ? `- Voice profile says NOT to include artist name - focus on song/content instead\n   ` : ''}${voiceProfile?.avoid_cringe_hashtags ? `- Voice profile says to avoid cringe hashtags - use niche, specific hashtags instead of #FYP, #Viral, etc.\n   ` : ''}${voiceProfile?.use_trending_hashtags === false ? `- Voice profile says NOT to use trending hashtags - focus on specific, niche hashtags\n   ` : ''}- Make each suggestion UNIQUE and DIFFERENT - avoid repetitive templates
   - Be specific and authentic to the music industry
   - Generate content that makes the user think "YES, this is exactly what I should add for THIS video"
8. For ${detectedTopic === 'coding/tech' || detectedTopic === 'film-short' ? detectedTopic : 'music'} content: Be specific, relevant, and make it share-worthy
9. Focus on making content that IMPRESSES users and makes them want to watch/listen
10. Generate 10 DIFFERENT, CREATIVE suggestions - each should be unique, context-aware, and specific to THIS video
11. PERFECT MATCH: The generated content should feel like it was written specifically for THIS video, not generic templates
12. 🚫 ABSOLUTE REQUIREMENT: Every title/description must be COMPLETE and READY TO USE - NO placeholders like "[Artist Name]" or "[Song Title]" - if detected info exists, use it; if not, create unique content without placeholders
13. ${voiceProfile ? `VOICE PROFILE ENFORCEMENT: Every single suggestion MUST reflect the voice profile settings above - check tone, emoji count, language style, and hashtag preferences match exactly` : ''}

${contentInstructions[contentType as keyof typeof contentInstructions]}

Only return valid JSON, no additional text.`;
}

function removePlaceholders(text: string): string {
  return text
    .replace(/\[Artist Name\]/gi, '')
    .replace(/\[Song Title\]/gi, '')
    .replace(/\[Genre\]/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanArray(arr: string[]): string[] {
  return arr
    .map(item => removePlaceholders(item))
    .filter(item => item.length > 0 && !item.match(/^\[.*\]$/));
}

function parseAIResponse(text: string, contentType: string, platform: string): any {
  try {
    const cleaned = text.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (contentType === 'all') {
      return {
        titles: cleanArray(parsed.titles || []),
        descriptions: cleanArray(parsed.descriptions || []),
        hashtags: cleanArray(parsed.hashtags || []),
        tags: cleanArray(parsed.tags || [])
      };
    }

    if (Array.isArray(parsed)) {
      const key = contentType === 'tags' ? 'tags' : contentType === 'hashtags' ? 'hashtags' : contentType + 's';
      return { [key]: cleanArray(parsed) };
    }

    const result: any = {};
    if (parsed.titles) result.titles = cleanArray(parsed.titles);
    if (parsed.descriptions) result.descriptions = cleanArray(parsed.descriptions);
    if (parsed.hashtags) result.hashtags = cleanArray(parsed.hashtags);
    if (parsed.tags) result.tags = cleanArray(parsed.tags);
    
    return Object.keys(result).length > 0 ? result : parsed;
  } catch {
    const lines = text.split('\n').filter(l => l.trim());
    const cleanedLines = lines.map(l => removePlaceholders(l)).filter(l => l.length > 0);
    
    if (contentType === 'title') {
      return { titles: cleanedLines.slice(0, 10) };
    }
    if (contentType === 'description') {
      return { descriptions: cleanedLines.slice(0, 10) };
    }
    if (contentType === 'hashtags') {
      const hashtags = cleanedLines
        .flatMap(l => l.match(/#\w+/g) || [])
        .slice(0, 20);
      return { hashtags };
    }
    if (contentType === 'tags') {
      return { tags: cleanedLines.slice(0, 12) };
    }
    return { error: "Failed to parse response" };
  }
}

