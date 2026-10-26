-- General ShieldMind academic Q&A is available to every signed-in account.
-- Paid tiers still require a verified Paystack payment; official campus source retrieval
-- remains limited by the caller's verified campus context. Sensitive campus actions are unchanged.

CREATE OR REPLACE FUNCTION public.consume_shieldmind_quota()
RETURNS TABLE(allowed boolean, remaining integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_now timestamptz := clock_timestamp();
  v_minute_start timestamptz := date_trunc('minute', clock_timestamp());
  v_day_start timestamptz := date_trunc('day', clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_plan text := 'free';
  v_minute_limit integer := 5;
  v_day_limit integer := 80;
  v_minute_count integer;
  v_day_count integer;
  v_session private.shieldmind_session_windows%rowtype;
BEGIN
  IF v_user_id IS NULL THEN RETURN QUERY SELECT false, 0; RETURN; END IF;
  SELECT s.plan INTO v_plan
    FROM public.shieldmind_subscriptions s
   WHERE s.user_id = v_user_id
     AND s.status = 'active'
     AND s.expires_at > v_now
     AND s.plan IN ('starter','plus','pro','ultra','max','premium')
   LIMIT 1;
  CASE COALESCE(v_plan, 'free')
    WHEN 'starter' THEN v_minute_limit := 10; v_day_limit := 250;
    WHEN 'plus' THEN v_minute_limit := 15; v_day_limit := 700;
    WHEN 'pro' THEN v_minute_limit := 25; v_day_limit := 1500;
    WHEN 'ultra' THEN v_minute_limit := 35; v_day_limit := 2500;
    WHEN 'max' THEN v_minute_limit := 50; v_day_limit := 4000;
    WHEN 'premium' THEN v_minute_limit := 10; v_day_limit := 250;
    ELSE v_minute_limit := 5; v_day_limit := 80;
  END CASE;
  INSERT INTO private.shieldmind_session_windows(user_id,session_started_at,cooldown_until,updated_at)
  VALUES(v_user_id,NULL,NULL,v_now) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO v_session FROM private.shieldmind_session_windows WHERE user_id=v_user_id FOR UPDATE;
  IF v_session.cooldown_until IS NOT NULL AND v_now < v_session.cooldown_until THEN
    RETURN QUERY SELECT false,0; RETURN;
  END IF;
  IF v_session.session_started_at IS NOT NULL AND v_now >= v_session.session_started_at + interval '8 hours' THEN
    UPDATE private.shieldmind_session_windows
       SET session_started_at=NULL,cooldown_until=v_now+interval '1 hour',updated_at=v_now
     WHERE user_id=v_user_id;
    RETURN QUERY SELECT false,0; RETURN;
  END IF;
  IF v_session.session_started_at IS NULL THEN
    UPDATE private.shieldmind_session_windows
       SET session_started_at=v_now,cooldown_until=NULL,updated_at=v_now
     WHERE user_id=v_user_id;
  END IF;
  INSERT INTO private.shieldmind_usage_windows(user_id,window_type,window_start,request_count)
  VALUES(v_user_id,'minute',v_minute_start,1)
  ON CONFLICT(user_id,window_type,window_start) DO UPDATE
    SET request_count=private.shieldmind_usage_windows.request_count+1
    WHERE private.shieldmind_usage_windows.request_count<v_minute_limit
  RETURNING request_count INTO v_minute_count;
  IF NOT FOUND THEN RETURN QUERY SELECT false,0; RETURN; END IF;
  INSERT INTO private.shieldmind_usage_windows(user_id,window_type,window_start,request_count)
  VALUES(v_user_id,'day',v_day_start,1)
  ON CONFLICT(user_id,window_type,window_start) DO UPDATE
    SET request_count=private.shieldmind_usage_windows.request_count+1
    WHERE private.shieldmind_usage_windows.request_count<v_day_limit
  RETURNING request_count INTO v_day_count;
  IF NOT FOUND THEN RETURN QUERY SELECT false,0; RETURN; END IF;
  DELETE FROM private.shieldmind_usage_windows WHERE window_start<v_now-interval '2 days';
  RETURN QUERY SELECT true,greatest(0,least(v_minute_limit-v_minute_count,v_day_limit-v_day_count));
END;
$function$;

CREATE OR REPLACE FUNCTION public.consume_shieldmind_image_upload()
RETURNS TABLE(allowed boolean, remaining integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_now timestamptz := clock_timestamp();
  v_month_start timestamptz := date_trunc('month', clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_limit integer := 0;
  v_count integer;
BEGIN
  IF v_user_id IS NULL THEN RETURN QUERY SELECT false,0; RETURN; END IF;
  SELECT COALESCE(s.image_upload_limit,0) INTO v_limit
    FROM public.shieldmind_subscriptions s
   WHERE s.user_id=v_user_id AND s.status='active' AND s.expires_at>v_now
     AND s.plan IN ('starter','plus','pro','ultra','max','premium')
   LIMIT 1;
  IF COALESCE(v_limit,0)<=0 THEN RETURN QUERY SELECT false,0; RETURN; END IF;
  INSERT INTO private.shieldmind_image_usage_windows(user_id,month_start,upload_count)
  VALUES(v_user_id,v_month_start,1)
  ON CONFLICT(user_id,month_start) DO UPDATE
    SET upload_count=private.shieldmind_image_usage_windows.upload_count+1
    WHERE private.shieldmind_image_usage_windows.upload_count<v_limit
  RETURNING upload_count INTO v_count;
  IF NOT FOUND THEN RETURN QUERY SELECT false,0; RETURN; END IF;
  DELETE FROM private.shieldmind_image_usage_windows WHERE month_start<v_now-interval '62 days';
  RETURN QUERY SELECT true,greatest(0,v_limit-v_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_shieldmind_quota() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consume_shieldmind_image_upload() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_shieldmind_quota() TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_shieldmind_image_upload() TO authenticated;
