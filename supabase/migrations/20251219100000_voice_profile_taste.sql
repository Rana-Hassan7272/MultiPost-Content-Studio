-- Voice profile: optional fields for AI to match user taste and content focus
ALTER TABLE voice_profiles ADD COLUMN IF NOT EXISTS content_focus text;
ALTER TABLE voice_profiles ADD COLUMN IF NOT EXISTS preferred_genres text[] DEFAULT '{}';
COMMENT ON COLUMN voice_profiles.content_focus IS 'e.g. music videos, songs, live performances, beats - helps AI stay relevant';
COMMENT ON COLUMN voice_profiles.preferred_genres IS 'e.g. HipHop, Pop, R&B - preferred music genres for suggestions';
