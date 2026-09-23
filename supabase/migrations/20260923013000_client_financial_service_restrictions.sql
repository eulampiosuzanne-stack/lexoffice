-- Restrição manual de atendimento controlada pela Dra. Suzanne no Financeiro.
create table if not exists public.client_service_restrictions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  active boolean not null default true,
  reason text not null default 'financial',
  restricted_at timestamptz not null default now(),
  restricted_by uuid references auth.users(id),
  released_at timestamptz,
  released_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists client_service_restrictions_one_active on public.client_service_restrictions(org_id,client_id) where active=true;
create index if not exists client_service_restrictions_org_active on public.client_service_restrictions(org_id,active,restricted_at desc);
alter table public.client_service_restrictions enable row level security;
create policy client_service_restrictions_org_select on public.client_service_restrictions for select to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.org_id=client_service_restrictions.org_id));
create policy client_service_restrictions_owner_insert on public.client_service_restrictions for insert to authenticated with check (restricted_by=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.org_id=client_service_restrictions.org_id));
create policy client_service_restrictions_owner_update on public.client_service_restrictions for update to authenticated using (restricted_by=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.org_id=client_service_restrictions.org_id)) with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.org_id=client_service_restrictions.org_id));
