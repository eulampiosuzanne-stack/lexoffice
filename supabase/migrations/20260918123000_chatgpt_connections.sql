-- Conexoes revogaveis para ChatGPT/MCP. Nenhum token em texto puro e armazenado.
create table if not exists public.chatgpt_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  owner_user_id uuid not null,
  name text not null default 'ChatGPT',
  token_hash text not null unique,
  scopes text[] not null default array['lex.health.read','lex.calendar.read']::text[],
  status text not null default 'active' check (status in ('active','revoked','disabled')),
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.chatgpt_connections enable row level security;
create policy "chatgpt_connections_org_read" on public.chatgpt_connections
for select using (org_id in (select org_id from public.profiles where id=auth.uid()));
create policy "chatgpt_connections_owner_write" on public.chatgpt_connections
for all using (owner_user_id=auth.uid()) with check (owner_user_id=auth.uid());

create table if not exists public.chatgpt_audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  connection_id uuid references public.chatgpt_connections(id) on delete set null,
  tool_name text not null,
  outcome text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.chatgpt_audit_log enable row level security;
create policy "chatgpt_audit_org_read" on public.chatgpt_audit_log
for select using (org_id in (select org_id from public.profiles where id=auth.uid()));
create index if not exists chatgpt_audit_org_created_idx on public.chatgpt_audit_log(org_id,created_at desc);
