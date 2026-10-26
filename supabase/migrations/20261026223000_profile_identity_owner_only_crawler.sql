-- Allow a user to edit only their own display name and avatar path.
-- Profile avatars remain in private Storage with per-user object-level access.
alter table public.profiles
  add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campus-profile-avatars','campus-profile-avatars',false,3145728,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = 3145728,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'],
  updated_at = now();

drop policy if exists campus_profile_avatar_read_own on storage.objects;
create policy campus_profile_avatar_read_own
on storage.objects for select to authenticated
using (
  bucket_id = 'campus-profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists campus_profile_avatar_upload_own on storage.objects;
create policy campus_profile_avatar_upload_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'campus-profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and storage.extension(name) in ('jpg','png','webp')
  and coalesce(metadata ->> 'mimetype','') in ('image/jpeg','image/png','image/webp')
  and coalesce(nullif(metadata ->> 'size','')::bigint,0) between 1 and 3145728
);

drop policy if exists campus_profile_avatar_delete_own on storage.objects;
create policy campus_profile_avatar_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'campus-profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function public.update_my_profile_identity(
  p_display_name text,
  p_avatar_path text default null,
  p_clear_avatar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text;
  v_avatar_path text;
begin
  if v_user_id is null then
    raise exception 'Sign in before editing your profile.' using errcode = '42501';
  end if;

  v_display_name := btrim(regexp_replace(coalesce(p_display_name, ''), '\s+', ' ', 'g'));
  if length(v_display_name) < 2 or length(v_display_name) > 60 then
    raise exception 'Display name must contain between 2 and 60 characters.' using errcode = '22023';
  end if;

  if p_avatar_path is not null then
    if p_avatar_path !~ ('^' || v_user_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$') then
      raise exception 'Avatar path is not valid for this account.' using errcode = '42501';
    end if;
    v_avatar_path := p_avatar_path;
  else
    select avatar_path into v_avatar_path
    from public.profiles where id = v_user_id;
    if p_clear_avatar then
      v_avatar_path := null;
    end if;
  end if;

  update public.profiles
    set display_name = v_display_name,
        avatar_path = v_avatar_path,
        last_profile_edit_at = now()
  where id = v_user_id;

  if not found then
    raise exception 'Profile record was not found.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('display_name', v_display_name, 'avatar_path', v_avatar_path);
end;
$$;

revoke all on function public.update_my_profile_identity(text,text,boolean) from public, anon;
grant execute on function public.update_my_profile_identity(text,text,boolean) to authenticated;
