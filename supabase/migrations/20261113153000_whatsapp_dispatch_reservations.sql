-- A provider timeout can occur after acceptance. Keep ambiguous attempts for reconciliation.
create table public.whatsapp_dispatch_reservations (
  org_id uuid not null,
  dispatch_key text not null,
  destination text not null,
  conversation_id uuid,
  agent_key text not null,
  provider text not null,
  state text not null default 'sending' check (state in ('sending', 'accepted', 'uncertain')),
  external_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, dispatch_key, destination)
);
alter table public.whatsapp_dispatch_reservations enable row level security;
revoke all on public.whatsapp_dispatch_reservations from public, anon, authenticated;
grant select, insert, update on public.whatsapp_dispatch_reservations to service_role;
