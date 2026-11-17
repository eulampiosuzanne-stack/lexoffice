create table public.process_ai_provider_consents (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references public.organizations(id),
 process_id uuid not null references public.processes(id) on delete cascade,
 provider text not null check(provider='gemini'),
 authorized_by uuid not null references auth.users(id),
 authorized_at timestamptz not null default now(),
 enabled boolean not null default true,
 authorization_source text not null,
 unique(process_id,provider)
);
alter table public.process_ai_provider_consents enable row level security;
create policy process_ai_provider_consents_owner_read on public.process_ai_provider_consents for select to authenticated using (org_id=public.current_org_id() and authorized_by=auth.uid());
revoke all on public.process_ai_provider_consents from anon,authenticated;
grant select on public.process_ai_provider_consents to authenticated;