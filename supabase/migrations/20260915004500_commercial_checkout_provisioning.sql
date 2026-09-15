-- Commercial checkout provisioning ledger.
-- Keeps checkout/payment identity separate from tenant data and supports idempotent activation.

create table if not exists public.commercial_checkout_orders (
  id uuid primary key default gen_random_uuid(),
  checkout_id text not null unique,
  provider text not null default 'asaas',
  plan text not null check (plan in ('essencial','profissional','avancado','enterprise')),
  amount_cents integer not null check (amount_cents >= 0),
  customer_name text not null,
  office_name text not null,
  customer_email text not null,
  customer_phone text null,
  customer_document text null,
  status text not null default 'pending' check (status in ('pending','paid','provisioned','failed','canceled','expired')),
  organization_id uuid null references public.organizations(id) on delete set null,
  owner_user_id uuid null references auth.users(id) on delete set null,
  provider_customer_id text null,
  provider_subscription_id text null,
  provider_payment_id text null,
  paid_at timestamptz null,
  provisioned_at timestamptz null,
  last_event_id text null,
  last_event_type text null,
  last_error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists commercial_checkout_orders_event_uidx
  on public.commercial_checkout_orders(provider,last_event_id)
  where last_event_id is not null;
create index if not exists commercial_checkout_orders_status_idx
  on public.commercial_checkout_orders(status,created_at desc);
create index if not exists commercial_checkout_orders_email_idx
  on public.commercial_checkout_orders(lower(customer_email));

alter table public.commercial_checkout_orders enable row level security;
revoke all on table public.commercial_checkout_orders from public, anon, authenticated;
grant all on table public.commercial_checkout_orders to service_role;

-- Platform admin gets read-only visibility for support/audit; customer data is never exposed cross-tenant.
grant select on table public.commercial_checkout_orders to authenticated;
drop policy if exists commercial_checkout_orders_platform_admin_select on public.commercial_checkout_orders;
create policy commercial_checkout_orders_platform_admin_select
on public.commercial_checkout_orders
for select to authenticated
using (public.is_platform_admin());

create or replace function public.lexoffice_touch_commercial_checkout_order()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.lexoffice_touch_commercial_checkout_order() from public,anon,authenticated;
grant execute on function public.lexoffice_touch_commercial_checkout_order() to service_role;
drop trigger if exists trg_touch_commercial_checkout_order on public.commercial_checkout_orders;
create trigger trg_touch_commercial_checkout_order
before update on public.commercial_checkout_orders
for each row execute function public.lexoffice_touch_commercial_checkout_order();

-- Normalize commercial plan names into the existing organization/subscription plan column.
create or replace function public.lexoffice_commercial_plan_key(p_plan text)
returns text
language sql
immutable
set search_path=public
as $$
  select case lower(coalesce(p_plan,''))
    when 'essencial' then 'essencial'
    when 'profissional' then 'profissional'
    when 'avancado' then 'avancado'
    when 'enterprise' then 'enterprise'
    else null
  end
$$;
revoke all on function public.lexoffice_commercial_plan_key(text) from public,anon,authenticated;
grant execute on function public.lexoffice_commercial_plan_key(text) to service_role;
