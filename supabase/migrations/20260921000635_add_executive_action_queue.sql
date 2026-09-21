create table if not exists public.executive_action_queue (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  source_run_id uuid references public.executive_dispatch_runs(id) on delete set null,
  action_type text not null,
  title text not null,
  description text,
  risk_level text not null default 'safe'
    check (risk_level in ('safe','controlled','sensitive')),
  status text not null default 'queued'
    check (status in ('queued','awaiting_approval','approved','executing','executed','rejected','failed')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  auto_authorized boolean not null default false,
  requires_suzanne boolean not null default false,
  idempotency_key text not null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  decision_note text,
  executed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id,idempotency_key)
);

create index if not exists executive_action_queue_org_status_created_idx
  on public.executive_action_queue(org_id,status,created_at desc);

alter table public.executive_action_queue enable row level security;
revoke all on table public.executive_action_queue from anon, authenticated;
grant select on table public.executive_action_queue to authenticated;
grant all on table public.executive_action_queue to service_role;

drop policy if exists platform_admins_read_executive_action_queue
  on public.executive_action_queue;
create policy platform_admins_read_executive_action_queue
  on public.executive_action_queue
  for select
  to authenticated
  using (
    exists (
      select 1 from public.platform_admins pa
      where pa.user_id = (select auth.uid())
        and pa.status = 'active'
    )
  );

create or replace function public.decide_executive_action(
  p_action_id uuid,
  p_decision text,
  p_note text default null
)
returns public.executive_action_queue
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_action public.executive_action_queue;
begin
  if v_user_id is null or not exists (
    select 1 from public.platform_admins pa
    where pa.user_id = v_user_id and pa.status = 'active'
  ) then
    raise exception 'not_authorized';
  end if;

  if p_decision not in ('approve','reject') then
    raise exception 'invalid_decision';
  end if;

  update public.executive_action_queue
  set status = case when p_decision='approve' then 'approved' else 'rejected' end,
      approved_by = case when p_decision='approve' then v_user_id else approved_by end,
      approved_at = case when p_decision='approve' then now() else approved_at end,
      rejected_by = case when p_decision='reject' then v_user_id else rejected_by end,
      rejected_at = case when p_decision='reject' then now() else rejected_at end,
      decision_note = nullif(trim(coalesce(p_note,'')),''),
      updated_at = now()
  where id = p_action_id
    and status = 'awaiting_approval'
  returning * into v_action;

  if v_action.id is null then
    raise exception 'action_not_pending';
  end if;
  return v_action;
end;
$$;

revoke all on function public.decide_executive_action(uuid,text,text) from public,anon;
grant execute on function public.decide_executive_action(uuid,text,text) to authenticated;
grant execute on function public.decide_executive_action(uuid,text,text) to service_role;
