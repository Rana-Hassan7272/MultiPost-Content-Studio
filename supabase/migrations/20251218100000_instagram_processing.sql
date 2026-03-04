-- Allow status 'processing' for Instagram video (async publish)
ALTER TABLE platform_posts DROP CONSTRAINT IF EXISTS platform_posts_status_check;
ALTER TABLE platform_posts ADD CONSTRAINT platform_posts_status_check
  CHECK (status IN ('pending', 'processing', 'published', 'failed'));

-- Store Instagram container ID while video is processing
ALTER TABLE platform_posts ADD COLUMN IF NOT EXISTS instagram_container_id text;
-- Store pending video job so worker can create container (Instagram download can exceed function timeout)
ALTER TABLE platform_posts ADD COLUMN IF NOT EXISTS instagram_file_path text;
ALTER TABLE platform_posts ADD COLUMN IF NOT EXISTS instagram_media_type text;
