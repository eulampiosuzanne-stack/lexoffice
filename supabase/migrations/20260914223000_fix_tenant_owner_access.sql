-- Restore the commercial multi-tenant access model.
-- Owner/admin can manage all operational records in their own organization.
-- Other users remain restricted to records assigned to them.
-- Cross-organization access remains blocked.

create or replace function public.lexoffice_can_manage_org(p_org_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.org_id = p_org_id
      and p.status = 'active'
      and p.role_key in ('owner','admin')
  )
$$;

revoke all on function public.lexoffice_can_manage_org(uuid) from public, anon;
grant execute on function public.lexoffice_can_manage_org(uuid) to authenticated, service_role;

create or replace function public.lexoffice_valid_owner_in_org(p_org_id uuid, p_owner_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_owner_user_id
      and p.org_id = p_org_id
      and p.status = 'active'
  )
$$;

revoke all on function public.lexoffice_valid_owner_in_org(uuid,uuid) from public, anon;
grant execute on function public.lexoffice_valid_owner_in_org(uuid,uuid) to authenticated, service_role;

do $$
declare
  t text;
  pol record;
begin
  foreach t in array array[
    'clients','processes','process_movements','process_deadlines','process_hearings',
    'documents','financial_entries','fee_contracts','fee_installments','collection_schedule',
    'payment_links','payment_receipts','calendar_events','calendar_sync_links','leads',
    'lead_activities','whatsapp_contacts','whatsapp_conversations','whatsapp_messages',
    'signature_requests','signature_signers','signature_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (
        org_id = (select public.current_org_id())
        and (owner_user_id = (select auth.uid()) or public.lexoffice_can_manage_org(org_id))
      )', t || '_tenant_select', t
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (
        org_id = (select public.current_org_id())
        and (
          owner_user_id = (select auth.uid())
          or (public.lexoffice_can_manage_org(org_id) and public.lexoffice_valid_owner_in_org(org_id, owner_user_id))
        )
      )', t || '_tenant_insert', t
    );

    execute format(
      'create policy %I on public.%I for update to authenticated using (
        org_id = (select public.current_org_id())
        and (owner_user_id = (select auth.uid()) or public.lexoffice_can_manage_org(org_id))
      ) with check (
        org_id = (select public.current_org_id())
        and (
          owner_user_id = (select auth.uid())
          or (public.lexoffice_can_manage_org(org_id) and public.lexoffice_valid_owner_in_org(org_id, owner_user_id))
        )
      )', t || '_tenant_update', t
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated using (
        org_id = (select public.current_org_id())
        and (owner_user_id = (select auth.uid()) or public.lexoffice_can_manage_org(org_id))
      )', t || '_tenant_delete', t
    );
  end loop;
end $$;
