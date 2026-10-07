-- Afazeres do escritório (Suzanne e Gláucia). Aplicada em produção em 07/10/2026.
create table if not exists public.office_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  scope text not null default 'geral' check (scope in ('geral','planejamento')),
  plan_kind text check (plan_kind in ('prev','trib','pat')),
  title text not null check (length(btrim(title)) between 1 and 300),
  notes text check (notes is null or length(notes) <= 2000),
  due_date date,
  assignee_user_id uuid references auth.users(id) on delete set null,
  done_at timestamptz,
  done_by uuid references auth.users(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responsible text not null default 'ambas' check (responsible in ('suzanne','glaucia','ambas')),
  priority text not null default 'normal' check (priority in ('normal','urgente')),
  constraint office_tasks_plan_needs_client check (scope <> 'planejamento' or (client_id is not null and plan_kind is not null))
);
create index if not exists office_tasks_org_scope_idx on public.office_tasks(org_id, scope, done_at);
create index if not exists office_tasks_client_idx on public.office_tasks(client_id, plan_kind);
create index if not exists office_tasks_created_by_idx on public.office_tasks(created_by);
create index if not exists office_tasks_done_by_idx on public.office_tasks(done_by);
create index if not exists office_tasks_assignee_idx on public.office_tasks(assignee_user_id);
alter table public.office_tasks enable row level security;
create policy office_tasks_select on public.office_tasks for select to authenticated using (public.can_access_office_operational_data(org_id));
create policy office_tasks_insert on public.office_tasks for insert to authenticated with check (public.can_access_office_operational_data(org_id));
create policy office_tasks_update on public.office_tasks for update to authenticated using (public.can_access_office_operational_data(org_id)) with check (public.can_access_office_operational_data(org_id));
create policy office_tasks_delete on public.office_tasks for delete to authenticated using (public.can_access_office_operational_data(org_id));
create or replace function public.office_tasks_touch() returns trigger language plpgsql set search_path=public as $$
begin new.updated_at := now();
  if new.done_at is not null and old.done_at is null then new.done_by := auth.uid(); end if;
  if new.done_at is null then new.done_by := null; end if;
  return new; end $$;
create trigger office_tasks_touch before update on public.office_tasks for each row execute function public.office_tasks_touch();
alter publication supabase_realtime add table public.office_tasks;
