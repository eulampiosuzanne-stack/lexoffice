-- Assistente de Petição Inicial (IA): histórico de análises e rascunhos por escritório
create table if not exists public.petition_assistant_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  created_by uuid,
  client_id uuid references public.clients(id) on delete set null,
  process_id uuid references public.processes(id) on delete set null,
  area text not null default 'civel',
  notes text,
  instructions text,
  document_ids uuid[] not null default '{}',
  dossier jsonb,
  calculation text,
  petition text,
  document_id uuid references public.documents(id) on delete set null,
  status text not null default 'analisado' check (status in ('analisado','redigido','revisado','salvo')),
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.petition_assistant_runs enable row level security;
drop policy if exists "petition_runs_org_select" on public.petition_assistant_runs;
create policy "petition_runs_org_select" on public.petition_assistant_runs
  for select using (org_id in (select org_id from public.profiles where id = auth.uid()));
drop policy if exists "petition_runs_org_update" on public.petition_assistant_runs;
create policy "petition_runs_org_update" on public.petition_assistant_runs
  for update using (org_id in (select org_id from public.profiles where id = auth.uid()))
  with check (org_id in (select org_id from public.profiles where id = auth.uid()));
drop policy if exists "petition_runs_org_delete" on public.petition_assistant_runs;
create policy "petition_runs_org_delete" on public.petition_assistant_runs
  for delete using (org_id in (select org_id from public.profiles where id = auth.uid()));
create index if not exists petition_runs_org_created_idx on public.petition_assistant_runs(org_id, created_at desc);
create index if not exists petition_runs_client_idx on public.petition_assistant_runs(client_id);
