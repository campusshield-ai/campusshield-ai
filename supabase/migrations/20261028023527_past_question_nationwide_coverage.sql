-- Public, aggregate-only nationwide coverage for approved, permission-confirmed authentic past papers.
-- No paper files, source URLs, submitter identities, pending submissions, or answer keys are exposed.
create or replace function public.get_past_question_coverage()
returns table (
  university_id uuid,
  university_name text,
  university_state text,
  ownership text,
  course_code text,
  course_title text,
  approved_paper_count bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  with approved_course_coverage as (
    select p.university_id, upper(btrim(p.course_code)) as course_code,
      max(btrim(p.course_title)) as course_title, count(*)::bigint as approved_paper_count
    from public.past_question_papers p
    where p.status = 'approved'
      and p.rights_confirmed is true
      and p.source_type <> 'ai_generated'
    group by p.university_id, upper(btrim(p.course_code))
  )
  select u.id as university_id, u.name as university_name,
    u.state as university_state, u.ownership, c.course_code, c.course_title,
    coalesce(c.approved_paper_count, 0)::bigint as approved_paper_count
  from public.campus_universities u
  left join approved_course_coverage c on c.university_id = u.id
  where u.is_active is true
  order by u.name, c.course_code;
$function$;

comment on function public.get_past_question_coverage() is
  'Returns only aggregate counts for approved, permission-confirmed non-AI past papers by active university and course. No paper contents or submitter data are returned.';

revoke all on function public.get_past_question_coverage() from public;
grant execute on function public.get_past_question_coverage() to anon, authenticated;
