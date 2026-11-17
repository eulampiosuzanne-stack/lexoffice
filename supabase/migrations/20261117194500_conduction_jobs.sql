create table public.process_conduction_jobs (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references public.organizations(id),
 owner_user_id uuid not null references auth.users(id),
 process_id uuid not null references public.processes(id) on delete cascade,
 stage text not null default 'reading',
 state jsonb not null,
 result jsonb,
 running_until timestamptz,
 revision integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.process_conduction_jobs enable row level security;
create policy conduction_jobs_read on public.process_conduction_jobs for select to authenticated
 using (org_id=public.current_org_id() and owner_user_id=auth.uid());
grant select on public.process_conduction_jobs to authenticated;
revoke all on public.process_conduction_jobs from anon;
