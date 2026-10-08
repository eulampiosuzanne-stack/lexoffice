create table if not exists public.process_access_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  process_id uuid not null,
  user_id uuid not null default auth.uid(),
  opened_at timestamptz not null default now()
);
create index if not exists process_access_log_org_opened_idx
  on public.process_access_log (org_id, opened_at desc);
create index if not exists process_access_log_process_idx
  on public.process_access_log (org_id, process_id, opened_at desc);
create index if not exists process_access_log_user_idx
  on public.process_access_log (org_id, user_id, opened_at desc);

alter table public.process_access_log enable row level security;
revoke all on public.process_access_log from anon, authenticated;
grant select, insert on public.process_access_log to authenticated;
grant all on public.process_access_log to service_role;

create policy process_access_log_insert_own_visible_process
on public.process_access_log for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.processes p
    where p.id = process_access_log.process_id and p.org_id = process_access_log.org_id
  )
);

create policy process_access_log_select_suzanne_only
on public.process_access_log for select to authenticated
using (
  (select auth.uid()) = '0e98483f-a464-422b-bf3e-68f454cdd405'::uuid
  and org_id = public.current_org_id()
);
