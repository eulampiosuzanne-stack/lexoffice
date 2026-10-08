-- Briefing diário da Donna: registro mínimo de idempotência e agendamento às 07:00 de São Paulo.
create table if not exists public.donna_daily_brief_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  brief_date date not null,
  status text not null check (status in ('processing', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (org_id, brief_date)
);

alter table public.donna_daily_brief_runs enable row level security;
revoke all on table public.donna_daily_brief_runs from anon, authenticated;
grant all on table public.donna_daily_brief_runs to service_role;

insert into public.system_runtime_secrets (key, secret)
values ('donna_daily_brief_token', gen_random_uuid()::text)
on conflict (key) do nothing;

-- Reutiliza o job existente para evitar dois briefings concorrentes.
select cron.schedule(
  'lexoffice-secretary-daily-brief',
  '0 10 * * *',
  $cron$
    select net.http_post(
      url := 'https://dcpwcuototomxoiszukt.supabase.co/functions/v1/secretary-supervisor',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-donna-token', (select secret from public.system_runtime_secrets where key = 'donna_daily_brief_token')
      ),
      body := '{"action":"donna_daily_brief","source":"pg_cron"}'::jsonb,
      timeout_milliseconds := 10000
    );
  $cron$
);
