-- Explicit least-privilege grants for campus-scoped SECURITY DEFINER RPCs.
-- PostgreSQL grants EXECUTE to PUBLIC by default when a function is first created;
-- removing PUBLIC/anon access keeps these privileged RPCs behind authenticated sessions.
begin;

revoke all on function public.get_my_campus_context() from public, anon;
revoke all on function public.set_my_campus_membership(uuid,text,text,text,text) from public, anon;
revoke all on function public.request_campus_university(text,text,text,text) from public, anon;
revoke all on function public.review_campus_account(uuid,text) from public, anon;
revoke all on function public.create_community_post(text,text,text,text) from public, anon;
revoke all on function public.create_community_comment(uuid,text) from public, anon;
revoke all on function public.report_community_content(text,uuid,text,text) from public, anon;
revoke all on function public.moderate_community_post(uuid,text) from public, anon;
revoke all on function public.moderate_community_comment(uuid,text) from public, anon;
revoke all on function public.resolve_community_report(uuid,text) from public, anon;

revoke all on function public.bootstrap_first_campus_admin(uuid) from public, anon;
revoke all on function public.list_campus_staff_membership_reviews() from public, anon;
revoke all on function public.review_campus_staff_membership(uuid,text) from public, anon;

revoke all on function public.create_campus_social_post(text,text,text,text) from public, anon;
revoke all on function public.create_community_poll(text,text,text,text,text,text,text) from public, anon;
revoke all on function public.create_community_reply(uuid,uuid,text) from public, anon;
revoke all on function public.toggle_community_reaction(uuid,text) from public, anon;
revoke all on function public.toggle_community_bookmark(uuid) from public, anon;
revoke all on function public.get_community_post_social(uuid[]) from public, anon;
revoke all on function public.get_community_poll_data(uuid) from public, anon;
revoke all on function public.vote_community_poll(uuid,uuid) from public, anon;
revoke all on function public.repost_community_post(uuid) from public, anon;
revoke all on function public.toggle_campus_follow(uuid,boolean) from public, anon;
revoke all on function public.toggle_campus_follow_post_author(uuid,boolean) from public, anon;

revoke all on function public.list_campus_content_moderation() from public, anon;
revoke all on function public.review_campus_content(text,uuid,text) from public, anon;
revoke all on function public.list_my_campus_group_memberships() from public, anon;
revoke all on function public.join_campus_group(uuid) from public, anon;
revoke all on function public.leave_campus_group(uuid) from public, anon;
revoke all on function public.report_campus_marketplace_listing(uuid,text,text) from public, anon;
revoke all on function public.review_campus_marketplace_report(uuid,text) from public, anon;
revoke all on function public.list_my_campus_marketplace_listings() from public, anon;
revoke all on function public.platform_list_campus_staff_candidates(uuid) from public, anon;
revoke all on function public.platform_assign_campus_admin(uuid,uuid) from public, anon;

grant execute on function public.get_my_campus_context() to authenticated;
grant execute on function public.set_my_campus_membership(uuid,text,text,text,text) to authenticated;
grant execute on function public.request_campus_university(text,text,text,text) to authenticated;
grant execute on function public.review_campus_account(uuid,text) to authenticated;
grant execute on function public.create_community_post(text,text,text,text) to authenticated;
grant execute on function public.create_community_comment(uuid,text) to authenticated;
grant execute on function public.report_community_content(text,uuid,text,text) to authenticated;
grant execute on function public.moderate_community_post(uuid,text) to authenticated;
grant execute on function public.moderate_community_comment(uuid,text) to authenticated;
grant execute on function public.resolve_community_report(uuid,text) to authenticated;

grant execute on function public.bootstrap_first_campus_admin(uuid) to authenticated;
grant execute on function public.list_campus_staff_membership_reviews() to authenticated;
grant execute on function public.review_campus_staff_membership(uuid,text) to authenticated;

grant execute on function public.create_campus_social_post(text,text,text,text) to authenticated;
grant execute on function public.create_community_poll(text,text,text,text,text,text,text) to authenticated;
grant execute on function public.create_community_reply(uuid,uuid,text) to authenticated;
grant execute on function public.toggle_community_reaction(uuid,text) to authenticated;
grant execute on function public.toggle_community_bookmark(uuid) to authenticated;
grant execute on function public.get_community_post_social(uuid[]) to authenticated;
grant execute on function public.get_community_poll_data(uuid) to authenticated;
grant execute on function public.vote_community_poll(uuid,uuid) to authenticated;
grant execute on function public.repost_community_post(uuid) to authenticated;
grant execute on function public.toggle_campus_follow(uuid,boolean) to authenticated;
grant execute on function public.toggle_campus_follow_post_author(uuid,boolean) to authenticated;

grant execute on function public.list_campus_content_moderation() to authenticated;
grant execute on function public.review_campus_content(text,uuid,text) to authenticated;
grant execute on function public.list_my_campus_group_memberships() to authenticated;
grant execute on function public.join_campus_group(uuid) to authenticated;
grant execute on function public.leave_campus_group(uuid) to authenticated;
grant execute on function public.report_campus_marketplace_listing(uuid,text,text) to authenticated;
grant execute on function public.review_campus_marketplace_report(uuid,text) to authenticated;
grant execute on function public.list_my_campus_marketplace_listings() to authenticated;
grant execute on function public.platform_list_campus_staff_candidates(uuid) to authenticated;
grant execute on function public.platform_assign_campus_admin(uuid,uuid) to authenticated;

commit;
