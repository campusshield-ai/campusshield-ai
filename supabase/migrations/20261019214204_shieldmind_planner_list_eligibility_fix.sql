-- Ensure the list RPC explicitly performs server-side eligibility checks before returning any rows.
create or replace function public.list_my_shieldmind_planner_items()
returns table(id uuid,title text,kind text,details text,starts_at timestamptz,remind_at timestamptz,completed boolean,created_at timestamptz,updated_at timestamptz)
language plpgsql security definer set search_path = ''
as $function$
begin
  perform private.shieldmind_require_eligible_caller();
  return query
    select p.id,p.title,p.kind,p.details,p.starts_at,p.remind_at,p.completed,p.created_at,p.updated_at
    from public.shieldmind_planner_items p
    where p.user_id = auth.uid()
    order by p.starts_at nulls last,p.created_at desc
    limit 100;
end;
$function$;
revoke all on function public.list_my_shieldmind_planner_items() from public, anon, authenticated;
grant execute on function public.list_my_shieldmind_planner_items() to authenticated;
