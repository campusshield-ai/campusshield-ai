-- Campus-only marketplace reports and scam-report moderation.
begin;

create table if not exists public.campus_marketplace_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.campus_marketplace_listings(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('scam_suspicion','spam','unsafe_item','misleading_listing','harassment','other')),
  details text check (details is null or char_length(btrim(details)) <= 600),
  status text not null default 'pending' check (status in ('pending','reviewed','dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint campus_marketplace_report_once unique (reporter_id,listing_id)
);
create index if not exists campus_marketplace_reports_queue_idx
  on public.campus_marketplace_reports(university_id,status,created_at);

alter table public.campus_marketplace_reports enable row level security;
drop policy if exists campus_marketplace_reports_read_same_campus_staff on public.campus_marketplace_reports;
create policy campus_marketplace_reports_read_same_campus_staff on public.campus_marketplace_reports
for select to authenticated using (
  university_id=(select private.current_campus_university_id())
  and private.current_campus_role()=any(array['admin','security','teacher'])
);

revoke all on table public.campus_marketplace_reports from public,anon,authenticated;
grant select (id,listing_id,university_id,reason,details,status,created_at,reviewed_at)
  on public.campus_marketplace_reports to authenticated;

create or replace function public.report_campus_marketplace_listing(
  p_listing_id uuid,p_reason text,p_details text default null
)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_seller_id uuid;
  v_id uuid;
begin
  if v_user_id is null or v_university_id is null then
    raise exception 'Sign in and choose your university before reporting a listing.';
  end if;
  if private.current_campus_account_status() not in ('pending','verified') then
    raise exception 'This account cannot report marketplace listings.';
  end if;
  if p_reason not in ('scam_suspicion','spam','unsafe_item','misleading_listing','harassment','other') then
    raise exception 'Choose a valid report reason.';
  end if;
  if p_details is not null and char_length(btrim(p_details))>600 then
    raise exception 'Details must be 600 characters or fewer.';
  end if;
  select l.seller_id into v_seller_id
  from public.campus_marketplace_listings l
  where l.id=p_listing_id and l.university_id=v_university_id and l.status in ('published','sold');
  if not found then raise exception 'This listing is not available in your university marketplace.'; end if;
  if v_seller_id=v_user_id then raise exception 'You cannot report your own listing.'; end if;
  insert into public.campus_marketplace_reports(listing_id,university_id,reporter_id,reason,details)
  values(p_listing_id,v_university_id,v_user_id,p_reason,nullif(btrim(coalesce(p_details,'')),''))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'You have already reported this listing.';
end;
$function$;

create or replace function public.list_campus_content_moderation()
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_university_id uuid := (select private.current_campus_university_id());
  v_role text := coalesce(private.current_campus_role(),'');
  v_result jsonb;
begin
  if v_role not in ('admin','security','teacher') then
    raise exception 'Verified campus staff access is required.';
  end if;
  select jsonb_build_object(
    'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'description',g.description,'group_type',g.group_type,'creator_username',g.creator_username,'created_at',g.created_at))
      from public.campus_groups g where g.university_id=v_university_id and g.status='pending'),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'description',e.description,'category',e.category,'starts_at',e.starts_at,'ends_at',e.ends_at,'location',e.location,'organizer_username',e.organizer_username,'created_at',e.created_at))
      from public.campus_events e where e.university_id=v_university_id and e.status='pending'),'[]'::jsonb),
    'listings',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'title',l.title,'description',l.description,'category',l.category,'price_ngn',l.price_ngn,'seller_username',l.seller_username,'created_at',l.created_at))
      from public.campus_marketplace_listings l where l.university_id=v_university_id and l.status='pending'),'[]'::jsonb),
    'listing_reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'listing_id',r.listing_id,'reason',r.reason,'details',r.details,'status',r.status,'created_at',r.created_at,'listing_title',l.title))
      from public.campus_marketplace_reports r join public.campus_marketplace_listings l on l.id=r.listing_id
      where r.university_id=v_university_id and r.status='pending'),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

create or replace function public.review_campus_marketplace_report(p_report_id uuid,p_decision text)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_university_id uuid := (select private.current_campus_university_id());
begin
  if coalesce(private.current_campus_role(),'') not in ('admin','security','teacher') then
    raise exception 'Verified staff membership for this university is required.';
  end if;
  if p_decision not in ('reviewed','dismissed','hide_listing') then
    raise exception 'Decision must be reviewed, dismissed, or hide_listing.';
  end if;
  if not exists(select 1 from public.campus_marketplace_reports r
    where r.id=p_report_id and r.university_id=v_university_id and r.status='pending') then
    raise exception 'This marketplace report is not waiting for review in your university.';
  end if;
  if p_decision='hide_listing' then
    update public.campus_marketplace_listings l set status='hidden',updated_at=now()
    from public.campus_marketplace_reports r
    where r.id=p_report_id and l.id=r.listing_id and l.university_id=v_university_id;
    update public.campus_marketplace_reports set status='reviewed',reviewed_at=now() where id=p_report_id;
  else
    update public.campus_marketplace_reports set status=p_decision,reviewed_at=now()
    where id=p_report_id and university_id=v_university_id;
  end if;
end;
$function$;

revoke all on function public.report_campus_marketplace_listing(uuid,text,text) from public,anon;
revoke all on function public.review_campus_marketplace_report(uuid,text) from public,anon;
grant execute on function public.report_campus_marketplace_listing(uuid,text,text) to authenticated;
grant execute on function public.review_campus_marketplace_report(uuid,text) to authenticated;

commit;
