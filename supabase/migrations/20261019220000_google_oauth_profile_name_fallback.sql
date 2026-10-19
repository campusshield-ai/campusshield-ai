-- Google OAuth-created accounts must get a usable display name, but stay pending students.
-- OAuth metadata is not trusted for role, campus membership, verification or admin privileges.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profiles (id, display_name, role, requested_role, verification_status)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      ''
    ),
    'student',
    'student',
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;
