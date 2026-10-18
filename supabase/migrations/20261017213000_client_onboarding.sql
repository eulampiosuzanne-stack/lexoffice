create table if not exists public.client_onboarding (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','sent','opened','acknowledged')),
  content jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  opened_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id)
);

create index if not exists client_onboarding_org_id_idx on public.client_onboarding(org_id);
create index if not exists client_onboarding_client_id_idx on public.client_onboarding(client_id);
alter table public.client_onboarding enable row level security;
grant select, insert, update on public.client_onboarding to authenticated;

create policy "office members manage onboarding"
on public.client_onboarding for all to authenticated
using (org_id in (select p.org_id from public.profiles p where p.id = (select auth.uid())))
with check (org_id in (select p.org_id from public.profiles p where p.id = (select auth.uid())));

create policy "clients read own onboarding"
on public.client_onboarding for select to authenticated
using (client_id in (select a.client_id from public.client_app_accounts a where a.user_id = (select auth.uid()) and a.enabled = true));

create policy "clients acknowledge own onboarding"
on public.client_onboarding for update to authenticated
using (client_id in (select a.client_id from public.client_app_accounts a where a.user_id = (select auth.uid()) and a.enabled = true))
with check (client_id in (select a.client_id from public.client_app_accounts a where a.user_id = (select auth.uid()) and a.enabled = true));
