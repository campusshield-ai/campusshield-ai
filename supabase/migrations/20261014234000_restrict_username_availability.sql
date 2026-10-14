-- Tighten the username availability endpoint and give the public profile table an explicit private self policy.
begin;

drop policy if exists community_profiles_read_own on public.community_profiles;
create policy community_profiles_read_own
  on public.community_profiles for select to authenticated
  using (user_id = (select auth.uid()));

revoke execute on function public.check_community_username_available(text) from anon, public;
grant execute on function public.check_community_username_available(text) to authenticated;

create or replace function public.initialize_community_profile()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_meta jsonb := '{}'::jsonb;
  v_username text;
  v_fallback text := 'student_' || substr(replace(new.id::text, '-', ''), 1, 12);
begin
  select coalesce(u.raw_user_meta_data, '{}'::jsonb)
    into v_meta
  from auth.users as u
  where u.id = new.id;

  v_username := lower(btrim(coalesce(v_meta ->> 'username', '')));

  if v_username !~ '^[a-z0-9_]{3,20}$'
     or v_username = any (array['admin', 'administrator', 'security', 'support', 'official', 'campusshield', 'staff', 'teacher']) then
    v_username := v_fallback;
  end if;

  begin
    insert into public.community_profiles (user_id, username)
    values (new.id, v_username)
    on conflict (user_id) do nothing;
  exception when unique_violation then
    if v_username = v_fallback then
      raise;
    end if;
    raise exception 'That username is already taken. Choose another one.';
  end;

  return new;
end;
$function$;

revoke all on function public.initialize_community_profile() from public, anon, authenticated;

commit;
