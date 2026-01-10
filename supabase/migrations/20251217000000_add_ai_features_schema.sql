CREATE TABLE IF NOT EXISTS voice_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  tone_style text[] DEFAULT ARRAY['energetic'],
  emoji_usage text NOT NULL DEFAULT 'moderate' CHECK (emoji_usage IN ('heavy', 'moderate', 'minimal')),
  language_style text[] DEFAULT ARRAY['english'],
  include_slang boolean DEFAULT true,
  avoid_cringe_hashtags boolean DEFAULT false,
  use_trending_hashtags boolean DEFAULT true,
  include_artist_name boolean DEFAULT true,
  brand_guidelines jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE voice_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own voice profiles"
  ON voice_profiles FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS ai_content_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('youtube', 'instagram', 'tiktok')),
  content_type text NOT NULL CHECK (content_type IN ('title', 'description', 'hashtags', 'tags')),
  generated_titles text[],
  generated_descriptions text[],
  generated_hashtags text[],
  generated_tags text[],
  confidence_score numeric(3,2),
  voice_profile_id uuid REFERENCES voice_profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ai_content_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai suggestions"
  ON ai_content_suggestions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ai suggestions"
  ON ai_content_suggestions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS posting_time_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('youtube', 'instagram', 'tiktok')),
  best_days integer[],
  best_hours integer[],
  average_views bigint DEFAULT 0,
  average_engagement numeric(5,2) DEFAULT 0,
  engagement_score numeric(5,2) DEFAULT 0,
  sample_size integer DEFAULT 0,
  last_updated timestamptz DEFAULT now(),
  UNIQUE(user_id, platform)
);

ALTER TABLE posting_time_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own posting insights"
  ON posting_time_insights FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS hashtag_trends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('youtube', 'instagram', 'tiktok')),
  hashtag text NOT NULL,
  trend_score integer DEFAULT 0,
  usage_count bigint DEFAULT 0,
  last_seen timestamptz DEFAULT now(),
  category text,
  UNIQUE(platform, hashtag)
);

CREATE INDEX IF NOT EXISTS idx_hashtag_trends_platform ON hashtag_trends(platform);
CREATE INDEX IF NOT EXISTS idx_hashtag_trends_score ON hashtag_trends(trend_score DESC);
CREATE INDEX IF NOT EXISTS idx_voice_profiles_user_id ON voice_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_post_id ON ai_content_suggestions(post_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_user_id ON ai_content_suggestions(user_id);

ALTER TABLE posts ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE posts ADD COLUMN IF NOT EXISTS voice_profile_id uuid REFERENCES voice_profiles(id);
ALTER TABLE platform_posts ADD COLUMN IF NOT EXISTS predicted_views_min bigint;
ALTER TABLE platform_posts ADD COLUMN IF NOT EXISTS predicted_views_max bigint;
ALTER TABLE platform_posts ADD COLUMN IF NOT EXISTS predicted_engagement numeric(5,2);
ALTER TABLE platform_posts ADD COLUMN IF NOT EXISTS predicted_confidence numeric(3,2);

