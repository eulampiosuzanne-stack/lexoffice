create index if not exists vip_greeting_deliveries_client_idx
  on public.vip_greeting_deliveries (org_id, client_id, created_at desc);

create policy vip_internal_secrets_service_role_only
on public.vip_internal_secrets for all to service_role
using (true) with check (true);

create policy vip_greeting_deliveries_service_role_only
on public.vip_greeting_deliveries for all to service_role
using (true) with check (true);
