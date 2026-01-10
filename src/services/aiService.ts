import { supabase } from '../lib/supabase';

interface GenerateContentParams {
  platform: 'youtube' | 'instagram' | 'tiktok';
  contentType: 'title' | 'description' | 'hashtags' | 'tags' | 'all';
  videoTitle?: string;
  videoDescription?: string;
  keywords?: string[];
  voiceProfileId?: string;
}

export async function generateAIContent(params: GenerateContentParams) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-content-generator`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: session.user.id,
        ...params,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'AI generation failed');
  }

  return await response.json();
}

