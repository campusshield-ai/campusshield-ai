-- Keep privileged campus-lifecycle implementations in the private schema.
-- Public RPC names remain stable, but the exposed wrappers execute as the caller.

begin;

alter function public.submit_campus_helpdesk_ticket(text,text,text,text,text) set schema private;
alter function private.submit_campus_helpdesk_ticket(text,text,text,text,text) rename to submit_campus_helpdesk_ticket_impl;

alter function public.update_campus_helpdesk_ticket(uuid,text,text,text) set schema private;
alter function private.update_campus_helpdesk_ticket(uuid,text,text,text) rename to update_campus_helpdesk_ticket_impl;

alter function public.publish_campus_notice(text,text,text,text,text,text,text,timestamptz) set schema private;
alter function private.publish_campus_notice(text,text,text,text,text,text,text,timestamptz) rename to publish_campus_notice_impl;

alter function public.archive_campus_notice(uuid) set schema private;
alter function private.archive_campus_notice(uuid) rename to archive_campus_notice_impl;

revoke all on function private.submit_campus_helpdesk_ticket_impl(text,text,text,text,text) from public, anon;
revoke all on function private.update_campus_helpdesk_ticket_impl(uuid,text,text,text) from public, anon;
revoke all on function private.publish_campus_notice_impl(text,text,text,text,text,text,text,timestamptz) from public, anon;
revoke all on function private.archive_campus_notice_impl(uuid) from public, anon;

grant execute on function private.submit_campus_helpdesk_ticket_impl(text,text,text,text,text) to authenticated, service_role;
grant execute on function private.update_campus_helpdesk_ticket_impl(uuid,text,text,text) to authenticated, service_role;
grant execute on function private.publish_campus_notice_impl(text,text,text,text,text,text,text,timestamptz) to authenticated, service_role;
grant execute on function private.archive_campus_notice_impl(uuid) to authenticated, service_role;

create or replace function public.submit_campus_helpdesk_ticket(
  p_category text,
  p_title text,
  p_description text,
  p_location text,
  p_priority text default 'normal'
)
returns table(ticket_id uuid, reference_code text)
language sql
security invoker
set search_path = ''
as $function$
  select * from private.submit_campus_helpdesk_ticket_impl($1,$2,$3,$4,$5);
$function$;

create or replace function public.update_campus_helpdesk_ticket(
  p_ticket_id uuid,
  p_status text default null,
  p_assigned_department text default null,
  p_message text default null
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.update_campus_helpdesk_ticket_impl($1,$2,$3,$4);
$function$;

create or replace function public.publish_campus_notice(
  p_publisher_label text,
  p_title text,
  p_body text,
  p_category text,
  p_audience_scope text default 'campus',
  p_target_faculty text default null,
  p_target_department text default null,
  p_expires_at timestamptz default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.publish_campus_notice_impl($1,$2,$3,$4,$5,$6,$7,$8);
$function$;

create or replace function public.archive_campus_notice(p_notice_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.archive_campus_notice_impl($1);
$function$;

revoke all on function public.submit_campus_helpdesk_ticket(text,text,text,text,text) from public, anon;
revoke all on function public.update_campus_helpdesk_ticket(uuid,text,text,text) from public, anon;
revoke all on function public.publish_campus_notice(text,text,text,text,text,text,text,timestamptz) from public, anon;
revoke all on function public.archive_campus_notice(uuid) from public, anon;

grant execute on function public.submit_campus_helpdesk_ticket(text,text,text,text,text) to authenticated, service_role;
grant execute on function public.update_campus_helpdesk_ticket(uuid,text,text,text) to authenticated, service_role;
grant execute on function public.publish_campus_notice(text,text,text,text,text,text,text,timestamptz) to authenticated, service_role;
grant execute on function public.archive_campus_notice(uuid) to authenticated, service_role;

commit;
