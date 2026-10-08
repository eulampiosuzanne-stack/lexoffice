create or replace view public.process_last_activity
with (security_invoker = true)
as
select
  p.id as process_id,
  p.org_id,
  p.client_id,
  p.cnj_number,
  p.internal_number,
  p.subject,
  p.status,
  p.updated_at,
  max(m.movement_date) as latest_movement_at
from public.processes p
left join public.process_movements m on m.process_id = p.id
group by p.id, p.org_id, p.client_id, p.cnj_number, p.internal_number, p.subject, p.status, p.updated_at;

revoke all on public.process_last_activity from anon;
grant select on public.process_last_activity to authenticated;
