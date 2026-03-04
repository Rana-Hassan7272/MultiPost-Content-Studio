-- Add prediction columns to platform_posts table
ALTER TABLE platform_posts
ADD COLUMN IF NOT EXISTS predicted_views_min integer,
ADD COLUMN IF NOT EXISTS predicted_views_max integer,
ADD COLUMN IF NOT EXISTS predicted_engagement numeric(5,2),
ADD COLUMN IF NOT EXISTS prediction_score integer,
ADD COLUMN IF NOT EXISTS predicted_at timestamp with time zone;

-- Create content_quality_scores table for tracking AI analysis
CREATE TABLE IF NOT EXISTS content_quality_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  platform text NOT NULL,
  title_score integer DEFAULT 0,
  description_score integer DEFAULT 0,
  hashtag_score integer DEFAULT 0,
  timing_score integer DEFAULT 0,
  overall_score integer DEFAULT 0,
  suggestions jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE content_quality_scores ENABLE ROW LEVEL SECURITY;

-- Policies for content_quality_scores
CREATE POLICY "Users can view own quality scores"
  ON content_quality_scores FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own quality scores"
  ON content_quality_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_platform_posts_predictions 
ON platform_posts (predicted_views_min, predicted_views_max) 
WHERE predicted_views_min IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_content_quality_user 
ON content_quality_scores (user_id, created_at DESC);
