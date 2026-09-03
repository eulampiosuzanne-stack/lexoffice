create table if not exists public.whatsapp_response_cycles (
  conversation_id uuid primary key references public.whatsapp_conversations(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  generation_token uuid not null default gen_random_uuid(),
  latest_external_message_id text,
  state text not null default 'waiting' check (state in ('waiting','processing','sent','suppressed','failed')),
  last_inbound_at timestamptz not null default now(),
  last_sent_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_response_cycles enable row level security;
revoke all on table public.whatsapp_response_cycles from anon, authenticated;
grant all on table public.whatsapp_response_cycles to service_role;

create index if not exists whatsapp_response_cycles_org_idx
  on public.whatsapp_response_cycles(org_id, updated_at desc);

alter table public.whatsapp_outbound_gate_log
  add column if not exists idempotency_key text;

create unique index if not exists whatsapp_outbound_gate_log_idempotency_uidx
  on public.whatsapp_outbound_gate_log(org_id, idempotency_key)
  where idempotency_key is not null;
