-- Read-only, university-scoped view of evidence review history.
begin;
create or replace function public.list_campus_identity_evidence_checks(p_subject_user_id uuid default null)
returns table (
  id uuid,
  subject_user_id uuid,
  evidence_type text,
  outcome text,
  source_kind text,
  source_reference text,
  reviewer_note text,
  checked_by uuid,
  checked_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
begin
  if v_actor is null then raise exception 'Sign in is required.'; end if;
  if (select private.current_campus_role()) is distinct from 'admin'
     or not exists (select 1 from public.profiles p where p.id=v_actor and p.role::text='admin' and p.verification_status::text='verified') then
    raise exception 'A verified campus administrator is required.';
  end if;
  if v_university_id is null then raise exception 'A university membership is required.'; end if;
  return query
    select c.id,c.subject_user_id,c.evidence_type,c.outcome,c.source_kind,c.source_reference,c.reviewer_note,c.checked_by,c.checked_at
    from public.campus_identity_evidence_checks c
    where c.university_id=v_university_id
      and (p_subject_user_id is null or c.subject_user_id=p_subject_user_id)
    order by c.checked_at desc
    limit 200;
end;
$function$;
revoke all on function public.list_campus_identity_evidence_checks(uuid) from public, anon;
grant execute on function public.list_campus_identity_evidence_checks(uuid) to authenticated, service_role;
commit;