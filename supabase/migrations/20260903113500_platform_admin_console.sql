create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id)
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon;
grant select on public.platform_admins to authenticated;
grant all on public.platform_admins to service_role;
create or replace function public.is_platform_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.platform_admins pa where pa.user_id=auth.uid() and pa.status='active'); $$;
revoke all on function public.is_platform_admin() from public,anon;
grant execute on function public.is_platform_admin() to authenticated,service_role;
drop policy if exists platform_admins_select_self on public.platform_admins;
create policy platform_admins_select_self on public.platform_admins for select to authenticated using(user_id=auth.uid());
insert into public.platform_admins(user_id,status) select p.id,'active' from public.profiles p where lower(p.email)=lower('eulampiosuzanne@gmail.com') on conflict(user_id) do update set status='active';
create table if not exists public.platform_subscriptions (
 id uuid primary key default gen_random_uuid(), org_id uuid not null unique references public.organizations(id) on delete cascade,
 plan text not null default 'starter', status text not null default 'trial' check(status in ('trial','active','past_due','suspended','canceled','not_configured')),
 amount_cents integer null check(amount_cents is null or amount_cents>=0), currency text not null default 'BRL', billing_cycle text not null default 'monthly' check(billing_cycle in ('monthly','annual','custom')),
 current_period_start timestamptz null,current_period_end timestamptz null,next_due_at timestamptz null,provider text null,provider_customer_id text null,provider_subscription_id text null,last_payment_at timestamptz null,metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.platform_subscriptions enable row level security;
revoke all on public.platform_subscriptions from anon;
grant select,insert,update on public.platform_subscriptions to authenticated;
grant all on public.platform_subscriptions to service_role;
drop policy if exists platform_subscriptions_admin_select on public.platform_subscriptions;
create policy platform_subscriptions_admin_select on public.platform_subscriptions for select to authenticated using(public.is_platform_admin());
drop policy if exists platform_subscriptions_admin_insert on public.platform_subscriptions;
create policy platform_subscriptions_admin_insert on public.platform_subscriptions for insert to authenticated with check(public.is_platform_admin());
drop policy if exists platform_subscriptions_admin_update on public.platform_subscriptions;
create policy platform_subscriptions_admin_update on public.platform_subscriptions for update to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
insert into public.platform_subscriptions(org_id,plan,status) select o.id,o.plan,case when o.status='active' then 'not_configured' else 'suspended' end from public.organizations o on conflict(org_id) do nothing;
create or replace function public.platform_init_subscription() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.platform_subscriptions(org_id,plan,status) values(new.id,new.plan,'trial') on conflict(org_id) do nothing; return new; end; $$;
revoke all on function public.platform_init_subscription() from public,anon,authenticated;
grant execute on function public.platform_init_subscription() to service_role;
drop trigger if exists trg_platform_init_subscription on public.organizations;
create trigger trg_platform_init_subscription after insert on public.organizations for each row execute function public.platform_init_subscription();
drop policy if exists organizations_platform_admin_select on public.organizations;
create policy organizations_platform_admin_select on public.organizations for select to authenticated using(public.is_platform_admin());
drop policy if exists profiles_platform_admin_select on public.profiles;
create policy profiles_platform_admin_select on public.profiles for select to authenticated using(public.is_platform_admin());
drop policy if exists audit_logs_platform_admin_select on public.audit_logs;
create policy audit_logs_platform_admin_select on public.audit_logs for select to authenticated using(public.is_platform_admin());
create index if not exists idx_platform_subscriptions_status on public.platform_subscriptions(status);
create index if not exists idx_platform_subscriptions_due on public.platform_subscriptions(next_due_at);
