-- Extend plan-limit enforcement to cover:
-- - voice profile count
-- - AI generations per month (ai_content_suggestions)

-- Add missing limit kinds (keep existing ones intact).
CREATE OR REPLACE FUNCTION get_plan_limit(p_user_id uuid, p_limit_kind text)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  plan text;
BEGIN
  plan := get_plan_type(p_user_id);
  CASE p_limit_kind
    WHEN 'posts_per_month' THEN
      RETURN CASE plan WHEN 'free' THEN 10 WHEN 'starter' THEN 50 WHEN 'pro' THEN 500 ELSE 10 END;
    WHEN 'connected_accounts' THEN
      RETURN CASE plan WHEN 'free' THEN 1 WHEN 'starter' THEN 2 WHEN 'pro' THEN 5 ELSE 1 END;
    WHEN 'media_library_items' THEN
      RETURN CASE plan WHEN 'free' THEN 20 WHEN 'starter' THEN 500 WHEN 'pro' THEN 2000 ELSE 20 END;
    WHEN 'storage_bytes' THEN
      RETURN CASE plan WHEN 'free' THEN 524288000 WHEN 'starter' THEN 2147483648 WHEN 'pro' THEN 16106127360 ELSE 524288000 END;
    WHEN 'ai_generations_per_month' THEN
      RETURN CASE plan WHEN 'free' THEN 20 WHEN 'starter' THEN 200 WHEN 'pro' THEN 1000 ELSE 20 END;
    WHEN 'voice_profiles' THEN
      RETURN CASE plan WHEN 'free' THEN 1 WHEN 'starter' THEN 2 WHEN 'pro' THEN 5 ELSE 1 END;
    ELSE
      RETURN 0;
  END CASE;
END;
$$;

-- Trigger: voice profiles count
CREATE OR REPLACE FUNCTION check_voice_profiles_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim bigint;
  cur bigint;
BEGIN
  lim := get_plan_limit(NEW.user_id, 'voice_profiles');
  SELECT count(*) INTO cur
  FROM voice_profiles
  WHERE user_id = NEW.user_id;

  IF cur >= lim THEN
    RAISE EXCEPTION 'Plan limit reached: % voice profile(s). Upgrade to add more.', lim;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_voice_profiles_limit ON voice_profiles;
CREATE TRIGGER trigger_check_voice_profiles_limit
  BEFORE INSERT ON voice_profiles
  FOR EACH ROW
  EXECUTE PROCEDURE check_voice_profiles_limit();

-- Trigger: AI generations per month
CREATE OR REPLACE FUNCTION check_ai_generations_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim bigint;
  cur bigint;
BEGIN
  lim := get_plan_limit(NEW.user_id, 'ai_generations_per_month');

  SELECT count(*) INTO cur
  FROM ai_content_suggestions
  WHERE user_id = NEW.user_id
    AND created_at >= date_trunc('month', now());

  IF cur >= lim THEN
    RAISE EXCEPTION 'Plan limit reached: % AI generations per month. Upgrade to add more.', lim;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_ai_generations_limit ON ai_content_suggestions;
CREATE TRIGGER trigger_check_ai_generations_limit
  BEFORE INSERT ON ai_content_suggestions
  FOR EACH ROW
  EXECUTE PROCEDURE check_ai_generations_limit();

