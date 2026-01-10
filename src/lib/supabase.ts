import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          company_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          company_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          company_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      connected_accounts: {
        Row: {
          id: string;
          user_id: string;
          platform: 'youtube' | 'instagram' | 'tiktok';
          account_name: string;
          account_id: string;
          access_token: string | null;
          refresh_token: string | null;
          expires_at: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
      };
      media_library: {
        Row: {
          id: string;
          user_id: string;
          file_name: string;
          file_type: 'image' | 'video';
          file_url: string;
          file_size: number;
          thumbnail_url: string | null;
          duration: number | null;
          width: number | null;
          height: number | null;
          created_at: string;
        };
      };
      posts: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          media_ids: string[] | null;
          platforms: string[];
          status: 'draft' | 'scheduled' | 'published' | 'failed';
          scheduled_for: string | null;
          published_at: string | null;
          tags: string[] | null;
          voice_profile_id: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      platform_posts: {
        Row: {
          id: string;
          post_id: string;
          platform: 'youtube' | 'instagram' | 'tiktok';
          platform_post_id: string | null;
          status: 'pending' | 'published' | 'failed';
          error_message: string | null;
          views: number;
          likes: number;
          comments: number;
          shares: number;
          predicted_views_min: number | null;
          predicted_views_max: number | null;
          predicted_engagement: number | null;
          predicted_confidence: number | null;
          published_at: string | null;
          created_at: string;
        };
      };
      voice_profiles: {
        Row: {
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
        };
      };
      ai_content_suggestions: {
        Row: {
          id: string;
          post_id: string | null;
          user_id: string;
          platform: 'youtube' | 'instagram' | 'tiktok';
          content_type: 'title' | 'description' | 'hashtags' | 'tags';
          generated_titles: string[] | null;
          generated_descriptions: string[] | null;
          generated_hashtags: string[] | null;
          generated_tags: string[] | null;
          confidence_score: number | null;
          voice_profile_id: string | null;
          created_at: string;
        };
      };
      posting_time_insights: {
        Row: {
          id: string;
          user_id: string;
          platform: 'youtube' | 'instagram' | 'tiktok';
          best_days: number[] | null;
          best_hours: number[] | null;
          average_views: number;
          average_engagement: number;
          engagement_score: number;
          sample_size: number;
          last_updated: string;
        };
      };
    };
  };
};
