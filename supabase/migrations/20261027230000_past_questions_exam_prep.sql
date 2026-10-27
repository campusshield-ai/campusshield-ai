-- Babcock-first Past Questions & Exam Prep foundation.
-- Additive only: private paper files, campus-scoped library records, protected answer keys,
-- server-graded attempts, and reviewer-only question authoring.
begin;

create table if not exists public.past_question_papers (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  department text not null check (char_length(btrim(department)) between 2 and 120),
  course_code text not null check (char_length(btrim(course_code)) between 2 and 32),
  course_title text not null check (char_length(btrim(course_title)) between 3 and 160),
  academic_level text not null check (academic_level in ('100','200','300','400','500','600','postgraduate')),
  semester text not null check (semester in ('first','second','summer','not_applicable')),
  exam_year integer not null check (exam_year between 1950 and 2100),
  title text not null check (char_length(btrim(title)) between 3 and 180),
  source_type text not null check (source_type in ('student_submission','official_source','lecturer_submission','library_record','ai_generated')),
  source_url text check (source_url is null or (char_length(source_url) <= 2048 and source_url ~* '^https://[^[:space:]]+$')),
  paper_path text,
  rights_confirmed boolean not null default false,
  rights_note text check (rights_note is null or char_length(btrim(rights_note)) <= 1200),
  status text not null default 'pending' check (status in ('pending','approved','rejected','archived')),
  review_note text check (review_note is null or char_length(btrim(review_note)) <= 1000),
  submitted_by uuid not null references auth.users(id) on delete cascade,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint past_question_has_source check (paper_path is not null or source_url is not null or source_type = 'ai_generated'),
  constraint past_question_owner_path check (paper_path is null or paper_path like submitted_by::text || '/%'),
  constraint past_question_rights_check check (source_type = 'ai_generated' or rights_confirmed = true)
);

create index if not exists past_question_papers_campus_status_year_idx
  on public.past_question_papers(university_id,status,exam_year desc,course_code);
create index if not exists past_question_papers_submitter_idx
  on public.past_question_papers(submitted_by,created_at desc);

create table if not exists public.past_question_items (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.past_question_papers(id) on delete cascade,
  sort_order integer not null check (sort_order between 1 and 200),
  question_text text not null check (char_length(btrim(question_text)) between 5 and 6000),
  question_type text not null check (question_type in ('mcq','written')),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  topic text not null default 'General' check (char_length(btrim(topic)) between 2 and 160),
  marks numeric(6,2) not null default 1 check (marks > 0 and marks <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (paper_id,sort_order),
  constraint past_question_mcq_options check (
    (question_type = 'mcq' and jsonb_array_length(options) between 2 and 6)
    or (question_type = 'written' and jsonb_array_length(options) = 0)
  )
);
create index if not exists past_question_items_paper_sort_idx
  on public.past_question_items(paper_id,sort_order);

-- Answer keys are deliberately stored separately. Authenticated students can read question
-- prompts, but cannot query correct answers or marking rubrics through the Data API.
create table if not exists public.past_question_answer_keys (
  question_id uuid primary key references public.past_question_items(id) on delete cascade,
  answer_text text not null check (char_length(btrim(answer_text)) between 1 and 6000),
  explanation text not null default '' check (char_length(explanation) <= 6000),
  grading_rubric text not null default '' check (char_length(grading_rubric) <= 6000),
  answer_source text not null default 'staff_verified' check (answer_source in ('staff_verified','ai_generated')),
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  paper_id uuid not null references public.past_question_papers(id) on delete cascade,
  mode text not null default 'practice' check (mode in ('practice','timed')),
  status text not null default 'in_progress' check (status in ('in_progress','submitted','abandoned')),
  time_limit_seconds integer not null default 0 check (time_limit_seconds between 0 and 3600),
  question_count integer not null check (question_count between 1 and 200),
  total_marks numeric(8,2) not null check (total_marks > 0 and total_marks <= 20000),
  earned_marks numeric(8,2) not null default 0 check (earned_marks >= 0 and earned_marks <= total_marks),
  percent numeric(5,2) check (percent is null or percent between 0 and 100),
  late_submission boolean not null default false,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists practice_attempts_user_submitted_idx
  on public.practice_attempts(user_id,created_at desc);
create index if not exists practice_attempts_campus_paper_idx
  on public.practice_attempts(university_id,paper_id,created_at desc);

create table if not exists public.practice_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.practice_attempts(id) on delete cascade,
  question_id uuid not null references public.past_question_items(id) on delete cascade,
  response_text text not null default '' check (char_length(response_text) <= 12000),
  topic_snapshot text not null default 'General' check (char_length(topic_snapshot) <= 160),
  maximum_marks numeric(6,2) not null check (maximum_marks > 0 and maximum_marks <= 100),
  awarded_marks numeric(6,2) check (awarded_marks is null or (awarded_marks >= 0 and awarded_marks <= maximum_marks)),
  marking_status text not null check (marking_status in ('auto_marked','ai_marked','needs_review')),
  feedback text not null default '' check (char_length(feedback) <= 6000),
  created_at timestamptz not null default now(),
  unique (attempt_id,question_id)
);
create index if not exists practice_answers_attempt_idx on public.practice_answers(attempt_id);
create index if not exists practice_answers_topic_idx on public.practice_answers(topic_snapshot,created_at desc);

alter table public.past_question_papers enable row level security;
alter table public.past_question_items enable row level security;
alter table public.past_question_answer_keys enable row level security;
alter table public.practice_attempts enable row level security;
alter table public.practice_answers enable row level security;

-- Paper metadata is visible only inside the member's own verified university.
drop policy if exists past_question_papers_select_campus on public.past_question_papers;
create policy past_question_papers_select_campus on public.past_question_papers
for select to authenticated
using (
  (select private.current_user_has_verified_campus_access())
  and exists (
    select 1 from public.campus_memberships cm
    where cm.user_id = (select auth.uid())
      and cm.university_id = past_question_papers.university_id
      and cm.membership_status = 'active'
      and cm.verification_status = 'verified'
  )
  and (
    submitted_by = (select auth.uid())
    or (
      status = 'approved'
      and (source_type <> 'ai_generated' or submitted_by = (select auth.uid()))
    )
    or exists (
      select 1 from public.campus_memberships reviewer
      join public.profiles rp on rp.id = reviewer.user_id
      where reviewer.user_id = (select auth.uid())
        and reviewer.university_id = past_question_papers.university_id
        and reviewer.campus_role in ('teacher','security','admin')
        and reviewer.membership_status = 'active'
        and reviewer.verification_status = 'verified'
        and rp.verification_status = 'verified'
        and rp.role in ('teacher','security','admin')
    )
  )
);

drop policy if exists past_question_papers_insert_own_pending on public.past_question_papers;
create policy past_question_papers_insert_own_pending on public.past_question_papers
for insert to authenticated
with check (
  submitted_by = (select auth.uid())
  and status = 'pending'
  and source_type in ('student_submission','official_source','lecturer_submission','library_record')
  and rights_confirmed = true
  and (paper_path is null or paper_path like (select auth.uid())::text || '/%')
  and (paper_path is not null or source_url is not null)
  and (select private.current_user_has_verified_campus_access())
  and exists (
    select 1 from public.campus_memberships cm
    where cm.user_id = (select auth.uid())
      and cm.university_id = past_question_papers.university_id
      and cm.membership_status = 'active'
      and cm.verification_status = 'verified'
  )
);

drop policy if exists past_question_papers_reviewer_update on public.past_question_papers;
create policy past_question_papers_reviewer_update on public.past_question_papers
for update to authenticated
using (
  exists (
    select 1 from public.campus_memberships cm
    join public.profiles p on p.id = cm.user_id
    where cm.user_id = (select auth.uid())
      and cm.university_id = past_question_papers.university_id
      and cm.campus_role in ('teacher','security','admin')
      and cm.membership_status = 'active'
      and cm.verification_status = 'verified'
      and p.verification_status = 'verified'
      and p.role in ('teacher','security','admin')
  )
)
with check (
  status in ('pending','approved','rejected','archived')
  and reviewed_by = (select auth.uid())
  and reviewed_at is not null
  and exists (
    select 1 from public.campus_memberships cm
    join public.profiles p on p.id = cm.user_id
    where cm.user_id = (select auth.uid())
      and cm.university_id = past_question_papers.university_id
      and cm.campus_role in ('teacher','security','admin')
      and cm.membership_status = 'active'
      and cm.verification_status = 'verified'
      and p.verification_status = 'verified'
      and p.role in ('teacher','security','admin')
  )
);

drop policy if exists past_question_items_select_accessible_paper on public.past_question_items;
create policy past_question_items_select_accessible_paper on public.past_question_items
for select to authenticated
using (
  exists (select 1 from public.past_question_papers p where p.id = past_question_items.paper_id)
);

drop policy if exists past_question_items_reviewer_insert on public.past_question_items;
create policy past_question_items_reviewer_insert on public.past_question_items
for insert to authenticated
with check (
  exists (
    select 1 from public.past_question_papers p
    join public.campus_memberships cm on cm.university_id = p.university_id
    join public.profiles profile on profile.id = cm.user_id
    where p.id = past_question_items.paper_id
      and cm.user_id = (select auth.uid())
      and cm.campus_role in ('teacher','security','admin')
      and cm.membership_status = 'active'
      and cm.verification_status = 'verified'
      and profile.verification_status = 'verified'
      and profile.role in ('teacher','security','admin')
      and (select private.current_user_has_verified_campus_access())
  )
);

drop policy if exists past_question_items_reviewer_update on public.past_question_items;
create policy past_question_items_reviewer_update on public.past_question_items
for update to authenticated
using (
  exists (
    select 1 from public.past_question_papers p
    join public.campus_memberships cm on cm.university_id = p.university_id
    join public.profiles profile on profile.id = cm.user_id
    where p.id = past_question_items.paper_id
      and cm.user_id = (select auth.uid())
      and cm.campus_role in ('teacher','security','admin')
      and cm.membership_status = 'active'
      and cm.verification_status = 'verified'
      and profile.verification_status = 'verified'
      and profile.role in ('teacher','security','admin')
      and (select private.current_user_has_verified_campus_access())
  )
)
with check (
  exists (
    select 1 from public.past_question_papers p
    join public.campus_memberships cm on cm.university_id = p.university_id
    join public.profiles profile on profile.id = cm.user_id
    where p.id = past_question_items.paper_id
      and cm.user_id = (select auth.uid())
      and cm.campus_role in ('teacher','security','admin')
      and cm.membership_status = 'active'
      and cm.verification_status = 'verified'
      and profile.verification_status = 'verified'
      and profile.role in ('teacher','security','admin')
      and (select private.current_user_has_verified_campus_access())
  )
);

drop policy if exists past_question_items_reviewer_delete on public.past_question_items;
create policy past_question_items_reviewer_delete on public.past_question_items
for delete to authenticated
using (
  exists (
    select 1 from public.past_question_papers p
    join public.campus_memberships cm on cm.university_id = p.university_id
    join public.profiles profile on profile.id = cm.user_id
    where p.id = past_question_items.paper_id
      and cm.user_id = (select auth.uid())
      and cm.campus_role in ('teacher','security','admin')
      and cm.membership_status = 'active'
      and cm.verification_status = 'verified'
      and profile.verification_status = 'verified'
      and profile.role in ('teacher','security','admin')
      and (select private.current_user_has_verified_campus_access())
  )
);

-- Keys can only be read or maintained by verified campus reviewers; never grant student SELECT.
drop policy if exists past_question_answer_keys_reviewer_only on public.past_question_answer_keys;
create policy past_question_answer_keys_reviewer_only on public.past_question_answer_keys
for all to authenticated
using (
  exists (
    select 1 from public.past_question_items qi
    join public.past_question_papers p on p.id = qi.paper_id
    join public.campus_memberships cm on cm.university_id = p.university_id
    join public.profiles profile on profile.id = cm.user_id
    where qi.id = past_question_answer_keys.question_id
      and cm.user_id = (select auth.uid())
      and cm.campus_role in ('teacher','security','admin')
      and cm.membership_status = 'active'
      and cm.verification_status = 'verified'
      and profile.verification_status = 'verified'
      and profile.role in ('teacher','security','admin')
      and (select private.current_user_has_verified_campus_access())
  )
)
with check (
  exists (
    select 1 from public.past_question_items qi
    join public.past_question_papers p on p.id = qi.paper_id
    join public.campus_memberships cm on cm.university_id = p.university_id
    join public.profiles profile on profile.id = cm.user_id
    where qi.id = past_question_answer_keys.question_id
      and cm.user_id = (select auth.uid())
      and cm.campus_role in ('teacher','security','admin')
      and cm.membership_status = 'active'
      and cm.verification_status = 'verified'
      and profile.verification_status = 'verified'
      and profile.role in ('teacher','security','admin')
      and (select private.current_user_has_verified_campus_access())
  )
);

drop policy if exists practice_attempts_select_own on public.practice_attempts;
create policy practice_attempts_select_own on public.practice_attempts
for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists practice_attempts_insert_own on public.practice_attempts;
create policy practice_attempts_insert_own on public.practice_attempts
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'in_progress'
  and submitted_at is null
  and (select private.current_user_has_verified_campus_access())
  and exists (
    select 1 from public.past_question_papers p
    join public.campus_memberships cm on cm.university_id = p.university_id
    where p.id = practice_attempts.paper_id
      and p.university_id = practice_attempts.university_id
      and p.status = 'approved'
      and (p.source_type <> 'ai_generated' or p.submitted_by = (select auth.uid()))
      and cm.user_id = (select auth.uid())
      and cm.membership_status = 'active'
      and cm.verification_status = 'verified'
  )
);

drop policy if exists practice_answers_select_own on public.practice_answers;
create policy practice_answers_select_own on public.practice_answers
for select to authenticated
using (
  exists (
    select 1 from public.practice_attempts a
    where a.id = practice_answers.attempt_id
      and a.user_id = (select auth.uid())
  )
);

revoke all on public.past_question_papers from anon, authenticated;
revoke all on public.past_question_items from anon, authenticated;
revoke all on public.past_question_answer_keys from anon, authenticated;
revoke all on public.practice_attempts from anon, authenticated;
revoke all on public.practice_answers from anon, authenticated;

grant select on public.past_question_papers to authenticated;
grant insert (university_id,department,course_code,course_title,academic_level,semester,exam_year,title,source_type,source_url,paper_path,rights_confirmed,rights_note,submitted_by)
  on public.past_question_papers to authenticated;
grant update (status,review_note,reviewed_by,reviewed_at,updated_at)
  on public.past_question_papers to authenticated;

grant select on public.past_question_items to authenticated;
grant insert (paper_id,sort_order,question_text,question_type,options,topic,marks)
  on public.past_question_items to authenticated;
grant update (sort_order,question_text,question_type,options,topic,marks,updated_at)
  on public.past_question_items to authenticated;
grant delete on public.past_question_items to authenticated;

grant select on public.past_question_answer_keys to authenticated;
grant insert (question_id,answer_text,explanation,grading_rubric,answer_source,reviewed_by)
  on public.past_question_answer_keys to authenticated;
grant update (answer_text,explanation,grading_rubric,answer_source,reviewed_by,updated_at)
  on public.past_question_answer_keys to authenticated;
grant delete on public.past_question_answer_keys to authenticated;

grant select on public.practice_attempts to authenticated;
grant insert (user_id,university_id,paper_id,mode,time_limit_seconds,question_count,total_marks)
  on public.practice_attempts to authenticated;
grant select on public.practice_answers to authenticated;
-- No client INSERT/UPDATE/DELETE is granted on answer records. The Edge Function writes them
-- with the service role only after validating the authenticated attempt and paper.

create or replace function public.add_past_question_item_with_answer_key(
  p_paper_id uuid,
  p_sort_order integer,
  p_question_text text,
  p_question_type text,
  p_options jsonb,
  p_topic text,
  p_marks numeric,
  p_answer_text text,
  p_explanation text,
  p_grading_rubric text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_question_id uuid;
begin
  if char_length(btrim(coalesce(p_question_text,''))) not between 5 and 6000
     or char_length(btrim(coalesce(p_answer_text,''))) not between 1 and 6000 then
    raise exception 'Enter a question and a marking answer.';
  end if;
  if p_question_type not in ('mcq','written') then
    raise exception 'Unsupported question type.';
  end if;
  if p_question_type = 'mcq' and (
    jsonb_typeof(p_options) <> 'array'
    or jsonb_array_length(p_options) not between 2 and 6
    or not exists (select 1 from jsonb_array_elements_text(p_options) option_text where option_text = p_answer_text)
  ) then
    raise exception 'Multiple-choice questions require 2–6 options and a correct answer matching one option.';
  end if;
  if p_question_type = 'written' and coalesce(jsonb_array_length(p_options),0) <> 0 then
    raise exception 'Written questions do not use options.';
  end if;

  insert into public.past_question_items
    (paper_id,sort_order,question_text,question_type,options,topic,marks)
  values
    (p_paper_id,p_sort_order,p_question_text,p_question_type,coalesce(p_options,'[]'::jsonb),coalesce(nullif(btrim(p_topic),''),'General'),p_marks)
  returning id into v_question_id;

  insert into public.past_question_answer_keys
    (question_id,answer_text,explanation,grading_rubric,answer_source,reviewed_by)
  values
    (v_question_id,p_answer_text,coalesce(p_explanation,''),coalesce(p_grading_rubric,''),'staff_verified',(select auth.uid()));

  return v_question_id;
end;
$function$;

revoke all on function public.add_past_question_item_with_answer_key(uuid,integer,text,text,jsonb,text,numeric,text,text,text) from public, anon;
grant execute on function public.add_past_question_item_with_answer_key(uuid,integer,text,text,jsonb,text,numeric,text,text,text) to authenticated;

-- A private storage bucket: student uploads are never public. Approved papers can be signed
-- for access by verified members of the same university; answer keys are never uploaded here.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('past-question-files','past-question-files',false,10485760,array['application/pdf'])
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists past_question_files_owner_upload on storage.objects;
create policy past_question_files_owner_upload on storage.objects
for insert to authenticated
with check (
  bucket_id = 'past-question-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select private.current_user_has_verified_campus_access())
);

drop policy if exists past_question_files_campus_read on storage.objects;
create policy past_question_files_campus_read on storage.objects
for select to authenticated
using (
  bucket_id = 'past-question-files'
  and (select private.current_user_has_verified_campus_access())
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.past_question_papers p
      join public.campus_memberships cm on cm.university_id = p.university_id
      where p.paper_path = storage.objects.name
        and p.status = 'approved'
        and p.source_type <> 'ai_generated'
        and cm.user_id = (select auth.uid())
        and cm.membership_status = 'active'
        and cm.verification_status = 'verified'
    )
    or exists (
      select 1 from public.past_question_papers p
      join public.campus_memberships cm on cm.university_id = p.university_id
      join public.profiles profile on profile.id = cm.user_id
      where p.paper_path = storage.objects.name
        and cm.user_id = (select auth.uid())
        and cm.campus_role in ('teacher','security','admin')
        and cm.membership_status = 'active'
        and cm.verification_status = 'verified'
        and profile.verification_status = 'verified'
        and profile.role in ('teacher','security','admin')
    )
  )
);

drop policy if exists past_question_files_owner_remove on storage.objects;
create policy past_question_files_owner_remove on storage.objects
for delete to authenticated
using (
  bucket_id = 'past-question-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

commit;
