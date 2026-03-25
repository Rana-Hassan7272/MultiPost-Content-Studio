-- Plan limits enforcement (sync with src/lib/planLimits.ts)

-- Effective plan type for user (defaults to free)
CREATE OR REPLACE FUNCTION get_plan_type(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT plan_type FROM subscriptions
     WHERE user_id = p_user_id AND status = 'active'
       AND (current_period_end IS NULL OR current_period_end >= now())
     LIMIT 1),
    'free'
  );
$$;

-- Limit value by kind
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
    ELSE
      RETURN 0;
  END CASE;
END;
$$;

-- Trigger: posts per month
CREATE OR REPLACE FUNCTION check_posts_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim bigint;
  cur bigint;
BEGIN
  lim := get_plan_limit(NEW.user_id, 'posts_per_month');
  SELECT count(*) INTO cur
  FROM posts
  WHERE user_id = NEW.user_id
    AND created_at >= date_trunc('month', now());
  IF cur >= lim THEN
    RAISE EXCEPTION 'Plan limit reached: % posts per month. Upgrade to add more.', lim;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_posts_limit ON posts;
CREATE TRIGGER trigger_check_posts_limit
  BEFORE INSERT ON posts
  FOR EACH ROW
  EXECUTE PROCEDURE check_posts_limit();

-- Trigger: connected accounts
CREATE OR REPLACE FUNCTION check_connected_accounts_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim bigint;
  cur bigint;
BEGIN
  IF NEW.is_active = false THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_active = true THEN
    RETURN NEW;
  END IF;
  lim := get_plan_limit(NEW.user_id, 'connected_accounts');
  SELECT count(*) INTO cur
  FROM connected_accounts
  WHERE user_id = NEW.user_id AND is_active = true
    AND id != NEW.id;
  IF cur >= lim THEN
    RAISE EXCEPTION 'Plan limit reached: % connected account(s). Upgrade to add more.', lim;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_connected_accounts_limit ON connected_accounts;
CREATE TRIGGER trigger_check_connected_accounts_limit
  BEFORE INSERT OR UPDATE ON connected_accounts
  FOR EACH ROW
  EXECUTE PROCEDURE check_connected_accounts_limit();

-- Trigger: media library (items + storage)
CREATE OR REPLACE FUNCTION check_media_library_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim_items bigint;
  lim_storage bigint;
  cur_items bigint;
  cur_storage bigint;
BEGIN
  lim_items := get_plan_limit(NEW.user_id, 'media_library_items');
  lim_storage := get_plan_limit(NEW.user_id, 'storage_bytes');
  SELECT count(*), COALESCE(sum(file_size), 0)::bigint INTO cur_items, cur_storage
  FROM media_library
  WHERE user_id = NEW.user_id;
  IF cur_items >= lim_items THEN
    RAISE EXCEPTION 'Plan limit reached: % media items. Upgrade to add more.', lim_items;
  END IF;
  IF cur_storage + COALESCE(NEW.file_size, 0) > lim_storage THEN
    RAISE EXCEPTION 'Storage limit reached. Upgrade to get more space.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_media_library_limit ON media_library;
CREATE TRIGGER trigger_check_media_library_limit
  BEFORE INSERT ON media_library
  FOR EACH ROW
  EXECUTE PROCEDURE check_media_library_limit();
