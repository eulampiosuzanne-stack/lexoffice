-- Lembretes personalizados por evento da Agenda
create table if not exists public.calendar_event_reminders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  minutes_before integer not null check (minutes_before > 0),
  channel text not null default 'whatsapp',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, minutes_before)
);
alter table public.calendar_event_reminders enable row level security;
create policy "calendar_event_reminders_org_access" on public.calendar_event_reminders
for all using (org_id in (select org_id from public.profiles where id = auth.uid()))
with check (org_id in (select org_id from public.profiles where id = auth.uid()));
create index if not exists calendar_event_reminders_due_idx on public.calendar_event_reminders(enabled, event_id, minutes_before);
