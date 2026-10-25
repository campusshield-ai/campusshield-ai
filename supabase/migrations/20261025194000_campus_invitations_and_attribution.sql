-- CampusShield AI: WhatsApp sharing and privacy-preserving invitation attribution.
-- Only attributed account counts are returned to the inviter; invitee identity is never exposed.

begin;

create table if not exists public.campus_invitation_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  constraint campus_invitation_codes_format check (code ~ '^[A-Z0-9]{10}$')
);

create table if not exists public.campus_invitation_attributions (
  invited_user_id uuid primary key references auth.users(id) on delete cascade,
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  invite_code text not null references public.campus_invitation_codes(code) on delete restrict,
  created_at timestamptz not null default now(),
  constraint campus_invitation_not_self check (invited_user_id <> referrer_user_id)
);

create index if not exists campus_invitation_attributions_referrer_created_idx
  on public.campus_invitation_attributions (referrer_user_id, created_at desc);

alter table public.campus_invitation_codes enable row level security;
alter table public.campus_invitation_attributions enable row level security;

revoke all on table public.campus_invitation_codes from public, anon, authenticated;
revoke all on table public.campus_invitation_attributions from public, anon, authenticated;

create or replace function private.attribute_campus_invitation_from_auth_metadata()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_code text;
  v_referrer uuid;
begin
  select upper(btrim(u.raw_user_meta_data ->> 'campus_invite_code'))
    into v_code
  from auth.users as u
  where u.id = new.id;

  if v_code is null or v_code !~ '^[A-Z0-9]{10}$' then
    return new;
  end if;

  select c.user_id into v_referrer
  from public.campus_invitation_codes as c
  where c.code = v_code;

  if v_referrer is null or v_referrer = new.id then
    return new;
  end if;

  insert into public.campus_invitation_attributions (
    invited_user_id, referrer_user_id, invite_code
  )
  values (new.id, v_referrer, v_code)
  on conflict (invited_user_id) do nothing;

  return new;
end;
$function$;

revoke all on function private.attribute_campus_invitation_from_auth_metadata() from public, anon, authenticated;

drop trigger if exists attribute_campus_invitation_after_profile_insert on public.profiles;
create trigger attribute_campus_invitation_after_profile_insert
after insert on public.profiles
for each row execute function private.attribute_campus_invitation_from_auth_metadata();

create or replace function private.get_my_campus_invitation_summary_impl()
returns table(invite_code text, signup_count bigint)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  v_code text;
  v_attempt integer;
begin
  if v_user is null then
    raise exception 'Sign in to manage your invitations.';
  end if;

  for v_attempt in 1..5 loop
    select c.code into v_code
    from public.campus_invitation_codes as c
    where c.user_id = v_user;

    exit when v_code is not null;

    insert into public.campus_invitation_codes (user_id, code)
    values (
      v_user,
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
    )
    on conflict do nothing;
  end loop;

  if v_code is null then
    select c.code into v_code
    from public.campus_invitation_codes as c
    where c.user_id = v_user;
  end if;

  if v_code is null then
    raise exception 'Could not create an invitation code. Please try again.';
  end if;

  return query
  select v_code, count(a.invited_user_id)::bigint
  from public.campus_invitation_attributions as a
  where a.referrer_user_id = v_user;
end;
$function$;

create or replace function public.get_my_campus_invitation_summary()
returns table(invite_code text, signup_count bigint)
language plpgsql
security invoker
set search_path to ''
as $wrapper$
begin
  return query select * from private.get_my_campus_invitation_summary_impl();
end;
$wrapper$;

create or replace function private.apply_my_campus_invitation_impl(p_code text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_referrer uuid;
  v_created_at timestamptz;
  v_inserted integer := 0;
begin
  if v_user is null or v_code !~ '^[A-Z0-9]{10}$' then
    return false;
  end if;

  select u.created_at into v_created_at
  from auth.users as u
  where u.id = v_user;

  -- This fallback is for newly created OAuth accounts, whose provider metadata
  -- cannot be customized before the profile-creation trigger runs.
  if v_created_at is null or v_created_at < now() - interval '2 hours' then
    return false;
  end if;

  select c.user_id into v_referrer
  from public.campus_invitation_codes as c
  where c.code = v_code;

  if v_referrer is null or v_referrer = v_user then
    return false;
  end if;

  insert into public.campus_invitation_attributions (
    invited_user_id, referrer_user_id, invite_code
  )
  values (v_user, v_referrer, v_code)
  on conflict (invited_user_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$function$;

create or replace function public.apply_my_campus_invitation(p_code text)
returns boolean
language plpgsql
security invoker
set search_path to ''
as $wrapper$
begin
  return private.apply_my_campus_invitation_impl(p_code);
end;
$wrapper$;

revoke all on function private.get_my_campus_invitation_summary_impl() from public, anon;
revoke all on function private.apply_my_campus_invitation_impl(text) from public, anon;
revoke all on function public.get_my_campus_invitation_summary() from public, anon;
revoke all on function public.apply_my_campus_invitation(text) from public, anon;

grant execute on function private.get_my_campus_invitation_summary_impl() to authenticated;
grant execute on function private.apply_my_campus_invitation_impl(text) to authenticated;
grant execute on function public.get_my_campus_invitation_summary() to authenticated;
grant execute on function public.apply_my_campus_invitation(text) to authenticated;

commit;
