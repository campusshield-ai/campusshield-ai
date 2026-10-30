-- Support generic web-push notices for new Study Circle discussion messages.
alter table public.campus_push_delivery_events
  drop constraint if exists campus_push_delivery_events_kind_check;
alter table public.campus_push_delivery_events
  add constraint campus_push_delivery_events_kind_check
  check (kind in ('timetable_reminder','new_message','course_discussion','campus_announcement','account_update','test'));
