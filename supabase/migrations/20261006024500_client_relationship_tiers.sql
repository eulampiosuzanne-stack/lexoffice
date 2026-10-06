-- CLIENTE relationship tier model
alter table public.clients
  add column if not exists relationship_tier text not null default 'CLIENTE'
    check (relationship_tier in ('LEAD','CLIENTE','CLIENTE_ATIVO','CLIENTE_PRIVATE','ENCERRADO')),
  add column if not exists relationship_tier_source text not null default 'system',
  add column if not exists relationship_tier_updated_at timestamptz not null default now();

create index if not exists idx_clients_relationship_tier on public.clients(org_id,relationship_tier);

comment on column public.clients.relationship_tier is
'Internal relationship classification. CLIENTE_PRIVATE is manual and is never auto-promoted.';
