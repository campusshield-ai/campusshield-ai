-- Staging: malware-scan quarantine for student identity uploads.
-- Files remain private and are never reviewable until a trusted scanner explicitly returns "clean".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-identity-quarantine', 'student-identity-quarantine', false, 5242880, array['image/jpeg','image/png','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','application/pdf'];

create table if not exists public.student_identity_upload_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('quarantined','scanning','clean','infected','scan_unavailable','error')),
  quarantine_path text,
  file_sha256 text,
  file_size_bytes integer not null check (file_size_bytes between 1 and 5242880),
  detected_mime text not null check (detected_mime in ('image/jpeg','image/png','application/pdf')),
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists student_identity_upload_scans_user_created_idx
  on public.student_identity_upload_scans(user_id, created_at desc);

alter table public.student_identity_upload_scans enable row level security;
revoke all on public.student_identity_upload_scans from anon, authenticated;
grant select on public.student_identity_upload_scans to authenticated;
drop policy if exists student_identity_upload_scans_own_read on public.student_identity_upload_scans;
create policy student_identity_upload_scans_own_read
on public.student_identity_upload_scans for select to authenticated
using (user_id = (select auth.uid()));

-- The browser must not write into either storage bucket directly. Uploads go through
-- the authenticated Edge Function, which validates file signatures and requires a scanner.
drop policy if exists student_identity_quarantine_no_browser_access on storage.objects;
create policy student_identity_quarantine_no_browser_access
on storage.objects for all to authenticated
using (bucket_id = 'student-identity-quarantine' and false)
with check (bucket_id = 'student-identity-quarantine' and false);

comment on table public.student_identity_upload_scans is
  'Audit status for identity uploads. Only authenticated users can read their own status; service role only can create/update scan jobs.';
