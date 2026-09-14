create table if not exists public.hearing_reminder_queue (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  process_id uuid null references public.processes(id) on delete cascade,
  client_id uuid null references public.clients(id) on delete set null,
  source_table text not null,
  source_event_id text not null,
  reminder_days integer not null check (reminder_days in (7,3,1,0)),
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','blocked','failed')),
  agent_key text not null default 'client_schedule_relationship',
  idempotency_key text not null,
  attempts integer not null default 0,
  last_attempt_at timestamptz null,
  sent_at timestamptz null,
  message_preview text null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(org_id,idempotency_key)
);
create index if not exists hearing_reminder_queue_due_idx on public.hearing_reminder_queue(org_id,status,scheduled_for);
alter table public.hearing_reminder_queue enable row level security;
drop policy if exists hearing_reminder_queue_org_select on public.hearing_reminder_queue;
create policy hearing_reminder_queue_org_select on public.hearing_reminder_queue for select to authenticated using (org_id=current_org_id());
