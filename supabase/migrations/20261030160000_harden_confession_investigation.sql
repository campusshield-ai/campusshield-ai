-- Require a documented moderation signal before identity investigation,
-- and let moderators hide reported confessions while resolving their report.
begin;

create or replace function public.investigate_campus_confession_author(p_confession_id uuid,p_purpose text)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare
  v_author uuid;
  v_actor uuid := (select auth.uid());
  v_status text;
begin
  if coalesce((select private.current_campus_role()),'') not in ('admin','security') then
    raise exception 'Only verified campus administrators or security staff may investigate a confession author.';
  end if;
  if char_length(btrim(coalesce(p_purpose,''))) not between 12 and 500 then
    raise exception 'Provide a specific investigation reason (12–500 characters).';
  end if;
  select c.author_id,c.status into v_author,v_status
  from public.campus_confessions c
  where c.id=p_confession_id and c.university_id=(select private.current_campus_university_id());
  if not found then raise exception 'Confession not found in your university.'; end if;
  if v_status not in ('hidden','pending') and not exists (
    select 1 from public.campus_confession_reports r
    where r.confession_id=p_confession_id and r.status='pending'
  ) then
    raise exception 'Only a pending, hidden, or actively reported confession may be investigated.';
  end if;
  insert into public.campus_confession_identity_audit(confession_id,accessed_by,purpose)
  values(p_confession_id,v_actor,btrim(p_purpose));
  return v_author;
end;
$function$;

create or replace function public.resolve_campus_confession_report(p_report_id uuid,p_decision text)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_confession_id uuid;
begin
  if coalesce((select private.current_campus_role()),'') not in ('admin','security','teacher') then
    raise exception 'Verified campus staff access is required to review reports.';
  end if;
  if p_decision not in ('reviewed','dismissed','hide_and_review') then
    raise exception 'Choose a valid report decision.';
  end if;
  update public.campus_confession_reports r
    set status=case when p_decision='hide_and_review' then 'reviewed' else p_decision end
    from public.campus_confessions c
    where r.id=p_report_id and r.confession_id=c.id
      and c.university_id=(select private.current_campus_university_id())
    returning r.confession_id into v_confession_id;
  if v_confession_id is null then raise exception 'Report not found in your university.'; end if;
  if p_decision='hide_and_review' then
    update public.campus_confessions
      set status='hidden',updated_at=now()
      where id=v_confession_id
        and university_id=(select private.current_campus_university_id());
  end if;
end;
$function$;

revoke all on function public.investigate_campus_confession_author(uuid,text) from public,anon;
revoke all on function public.resolve_campus_confession_report(uuid,text) from public,anon;
grant execute on function public.investigate_campus_confession_author(uuid,text) to authenticated;
grant execute on function public.resolve_campus_confession_report(uuid,text) to authenticated;
commit;
