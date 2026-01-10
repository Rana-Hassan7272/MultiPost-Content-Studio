import { supabase } from '../lib/supabase';

export interface VoiceProfile {
  id: string;
  user_id: string;
  name: string;
  tone_style: string[];
  emoji_usage: 'heavy' | 'moderate' | 'minimal';
  language_style: string[];
  include_slang: boolean;
  avoid_cringe_hashtags: boolean;
  use_trending_hashtags: boolean;
  include_artist_name: boolean;
  brand_guidelines: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export async function getVoiceProfiles(): Promise<VoiceProfile[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('voice_profiles')
    .select('*')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createVoiceProfile(profile: Omit<VoiceProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<VoiceProfile> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('voice_profiles')
    .insert({
      user_id: session.user.id,
      ...profile,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateVoiceProfile(id: string, updates: Partial<VoiceProfile>): Promise<VoiceProfile> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('voice_profiles')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', session.user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

