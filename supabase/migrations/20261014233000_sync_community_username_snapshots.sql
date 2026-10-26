-- Keep old posts/comments aligned with a user's current public handle.
begin;

create or replace function public.sync_community_username_snapshots()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.username is distinct from old.username then
    update public.community_posts
    set author_username = new.username,
        updated_at = now()
    where author_id = new.user_id;

    update public.community_comments
    set author_username = new.username,
        updated_at = now()
    where author_id = new.user_id;
  end if;

  return new;
end;
$function$;

revoke all on function public.sync_community_username_snapshots() from public, anon, authenticated;

drop trigger if exists sync_community_username_snapshots_after_update on public.community_profiles;
create trigger sync_community_username_snapshots_after_update
  after update of username on public.community_profiles
  for each row execute function public.sync_community_username_snapshots();

commit;
