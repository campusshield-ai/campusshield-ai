-- Structural and privilege assertions after applying the Live Classroom candidate to the disposable clone.
do $live_classroom_postflight$
declare
  v_signature text;
  v_oid oid;
  v_security_definer boolean;
  v_config text[];
begin
  if to_regclass('public.campus_live_class_sessions') is null then
    raise exception 'Live Classroom session table was not created.';
  end if;

  if not exists (select 1 from pg_class where oid='public.campus_live_class_sessions'::regclass and relrowsecurity) then
    raise exception 'Live Classroom sessions table must have RLS enabled.';
  end if;

  if exists (select 1 from pg_policy where polrelid='public.campus_live_class_sessions'::regclass) then
    raise exception 'Live Classroom sessions must not have direct row policies; all access is through scoped authenticated RPCs.';
  end if;

  if has_table_privilege('anon','public.campus_live_class_sessions','SELECT')
     or has_table_privilege('authenticated','public.campus_live_class_sessions','SELECT')
     or has_table_privilege('anon','public.campus_live_class_sessions','INSERT')
     or has_table_privilege('authenticated','public.campus_live_class_sessions','INSERT')
     or has_table_privilege('anon','public.campus_live_class_sessions','UPDATE')
     or has_table_privilege('authenticated','public.campus_live_class_sessions','UPDATE') then
    raise exception 'Live Classroom table has unintended direct client grants.';
  end if;

  foreach v_signature in array array[
    'public.create_campus_live_class_session(uuid,text,text,timestamp with time zone,integer,text)',
    'public.list_campus_live_class_sessions(uuid)',
    'public.get_campus_live_classroom_capabilities(uuid)',
    'public.start_campus_live_class_session(uuid)',
    'public.end_campus_live_class_session(uuid)',
    'public.set_campus_live_class_recording(uuid,text)',
    'public.get_campus_live_class_token_context(uuid)',
    'public.list_campus_live_classrooms()',
    'public.create_campus_classroom(text,text,text)'
  ] loop
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'Required Live Classroom/public classroom RPC is missing: %',v_signature;
    end if;
    select p.prosecdef,p.proconfig into v_security_definer,v_config from pg_proc p where p.oid=v_oid;
    if v_security_definer is distinct from false then
      raise exception 'Public RPC must remain SECURITY INVOKER: %',v_signature;
    end if;
    if array_position(coalesce(v_config,array[]::text[]),'search_path=""') is null then
      raise exception 'Public RPC must pin an empty search_path: %',v_signature;
    end if;
    if has_function_privilege('anon',v_oid,'EXECUTE')
       or has_function_privilege('public',v_oid,'EXECUTE')
       or not has_function_privilege('authenticated',v_oid,'EXECUTE') then
      raise exception 'Public RPC grants must be authenticated-only: %',v_signature;
    end if;
  end loop;

  foreach v_signature in array array[
    'private.can_access_live_classroom(uuid)',
    'private.can_manage_campus_live_classroom(uuid)',
    'private.is_verified_campus_admin_for_classroom(uuid)',
    'private.create_campus_classroom_impl(text,text,text)'
  ] loop
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'Required private authorization implementation is missing: %',v_signature;
    end if;
    select p.prosecdef,p.proconfig into v_security_definer,v_config from pg_proc p where p.oid=v_oid;
    if v_security_definer is distinct from true
       or array_position(coalesce(v_config,array[]::text[]),'search_path=""') is null then
      raise exception 'Private implementation must be SECURITY DEFINER with empty search_path: %',v_signature;
    end if;
  end loop;

  if has_function_privilege('anon','private.can_access_live_classroom(uuid)','EXECUTE')
     or has_function_privilege('public','private.can_access_live_classroom(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','private.can_access_live_classroom(uuid)','EXECUTE') then
    raise exception 'Private live-class access helper grants are unsafe.';
  end if;

  if not has_function_privilege('authenticated','private.create_campus_classroom_impl(text,text,text)','EXECUTE')
     or has_function_privilege('anon','private.create_campus_classroom_impl(text,text,text)','EXECUTE')
     or has_function_privilege('public','private.create_campus_classroom_impl(text,text,text)','EXECUTE') then
    raise exception 'Private classroom creation implementation grants are unsafe.';
  end if;
end
$live_classroom_postflight$;

select 'Live Classroom Production postflight passed.' as result;
