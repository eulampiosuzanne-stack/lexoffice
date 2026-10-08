create table if not exists public.process_ai_summaries (
  process_id uuid primary key references public.processes(id) on delete cascade,
  org_id uuid not null,
  summary text not null,
  latest_movement_created_at timestamptz,
  movement_count integer not null default 0 check (movement_count >= 0),
  generated_at timestamptz not null default now()
);

alter table public.process_ai_summaries enable row level security;
revoke all on public.process_ai_summaries from anon;
grant select, insert, update on public.process_ai_summaries to authenticated;
grant all on public.process_ai_summaries to service_role;

drop policy if exists process_ai_summaries_select on public.process_ai_summaries;
create policy process_ai_summaries_select
on public.process_ai_summaries for select to authenticated
using (
  exists (
    select 1 from public.processes p
    where p.id = process_id and p.org_id = process_ai_summaries.org_id
      and public.can_view_owner_process_data(p.org_id, p.owner_user_id)
  )
);

drop policy if exists process_ai_summaries_insert on public.process_ai_summaries;
create policy process_ai_summaries_insert
on public.process_ai_summaries for insert to authenticated
with check (
  exists (
    select 1 from public.processes p
    where p.id = process_id and p.org_id = process_ai_summaries.org_id
      and public.can_edit_owner_process_data(p.org_id, p.owner_user_id)
  )
);

drop policy if exists process_ai_summaries_update on public.process_ai_summaries;
create policy process_ai_summaries_update
on public.process_ai_summaries for update to authenticated
using (
  exists (
    select 1 from public.processes p
    where p.id = process_id and p.org_id = process_ai_summaries.org_id
      and public.can_edit_owner_process_data(p.org_id, p.owner_user_id)
  )
)
with check (
  exists (
    select 1 from public.processes p
    where p.id = process_id and p.org_id = process_ai_summaries.org_id
      and public.can_edit_owner_process_data(p.org_id, p.owner_user_id)
  )
);
