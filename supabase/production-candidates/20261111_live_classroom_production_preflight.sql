-- READ-ONLY Production compatibility preflight for the Live Classroom candidate.
do $live_classroom_preflight$
declare
  v_security_definer boolean;
  v_signature text;
begin
  if to_regclass('public.campus_classrooms') is null
     or to_regclass('public.campus_classroom_enrollments') is null
     or to_regclass('public.campus_memberships') is null
     or to_regclass('public.campus_universities') is null
     or to_regclass('public.profiles') is null then
    raise exception 'Production classroom, enrollment, or campus membership dependencies are missing.';
  end if;

  if to_regclass('public.campus_live_class_sessions') is not null then
    raise exception 'Live Classroom session table already exists; stop and reconcile before applying a first-time Production candidate.';
  end if;

  if to_regprocedure('private.can_access_classroom(uuid)') is null
     or to_regprocedure('private.can_manage_class_attendance(uuid)') is null
     or to_regprocedure('private.current_campus_university_id()') is null
     or to_regprocedure('private.is_verified_classroom_teacher(uuid)') is null
     or to_regprocedure('private.create_campus_classroom_impl(text,text,text)') is null
     or to_regprocedure('public.create_campus_classroom(text,text,text)') is null then
    raise exception 'One or more existing Production classroom authorization dependencies are missing.';
  end if;

  select p.prosecdef into v_security_definer
  from pg_proc p where p.oid=to_regprocedure('public.create_campus_classroom(text,text,text)');
  if v_security_definer is distinct from false then
    raise exception 'Existing Production public.create_campus_classroom must remain SECURITY INVOKER.';
  end if;

  foreach v_signature in array array[
    'public.create_campus_live_class_session(uuid,text,text,timestamp with time zone,integer,text)',
    'public.list_campus_live_class_sessions(uuid)',
    'public.get_campus_live_classroom_capabilities(uuid)',
    'public.start_campus_live_class_session(uuid)',
    'public.end_campus_live_class_session(uuid)',
    'public.set_campus_live_class_recording(uuid,text)',
    'public.get_campus_live_class_token_context(uuid)',
    'public.list_campus_live_classrooms()'
  ] loop
    if to_regprocedure(v_signature) is not null then
      raise exception 'Unexpected Production Live Classroom RPC collision: %',v_signature;
    end if;
  end loop;

  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='campus_classrooms' and column_name='assistant_student_id' and data_type='uuid')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='campus_classrooms' and column_name='join_code' and data_type='text')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='campus_memberships' and column_name='verification_status')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='campus_universities' and column_name='is_active') then
    raise exception 'Production classroom or campus columns do not match the reviewed Live Classroom contract.';
  end if;
end
$live_classroom_preflight$;

select 'Live Classroom Production preflight passed (read-only).' as result;
