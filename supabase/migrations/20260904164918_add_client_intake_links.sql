create table if not exists public.client_intake_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  client_id uuid references public.clients(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists client_intake_links_owner_created_idx on public.client_intake_links(owner_user_id, created_at desc);
create index if not exists client_intake_links_expiry_idx on public.client_intake_links(expires_at);
alter table public.client_intake_links enable row level security;
revoke all on table public.client_intake_links from anon;
grant select, update on table public.client_intake_links to authenticated;
create policy "client_intake_links_owner_select" on public.client_intake_links for select to authenticated using (org_id = public.current_org_id() and owner_user_id = auth.uid());
create policy "client_intake_links_owner_update" on public.client_intake_links for update to authenticated using (org_id = public.current_org_id() and owner_user_id = auth.uid()) with check (org_id = public.current_org_id() and owner_user_id = auth.uid());
