begin;

alter table public.integration_connections
  drop constraint if exists integration_connections_org_id_provider_key;
drop index if exists public.integration_connections_org_id_provider_key;
create unique index if not exists integration_connections_org_owner_provider_uidx
  on public.integration_connections(org_id, owner_user_id, provider)
  where owner_user_id is not null;

alter table public.ai_conversation_controls
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

update public.ai_conversation_controls c
set owner_user_id = coalesce(
  c.owner_user_id,
  (
    select p.id
    from public.profiles p
    where p.org_id = c.org_id
    order by case when p.role_key = 'owner' then 0 else 1 end,
             p.created_at nulls last,
             p.id
    limit 1
  )
)
where c.owner_user_id is null;

alter table public.ai_conversation_controls
  alter column owner_user_id set not null;

alter table public.ai_conversation_controls
  drop constraint if exists ai_conversation_controls_org_id_contact_key_key;
drop index if exists public.ai_conversation_controls_org_id_contact_key_key;
create unique index if not exists ai_conversation_controls_owner_contact_uidx
  on public.ai_conversation_controls(org_id, owner_user_id, contact_key);
create index if not exists ai_conversation_controls_owner_idx
  on public.ai_conversation_controls(org_id, owner_user_id);

alter table public.ai_conversation_controls enable row level security;
drop policy if exists ai_conversation_controls_org_access on public.ai_conversation_controls;
drop policy if exists ai_conversation_controls_owner_select on public.ai_conversation_controls;
drop policy if exists ai_conversation_controls_owner_insert on public.ai_conversation_controls;
drop policy if exists ai_conversation_controls_owner_update on public.ai_conversation_controls;
drop policy if exists ai_conversation_controls_owner_delete on public.ai_conversation_controls;
create policy ai_conversation_controls_owner_select on public.ai_conversation_controls
for select to authenticated
using (org_id = public.current_org_id() and owner_user_id = auth.uid());
create policy ai_conversation_controls_owner_insert on public.ai_conversation_controls
for insert to authenticated
with check (org_id = public.current_org_id() and owner_user_id = auth.uid());
create policy ai_conversation_controls_owner_update on public.ai_conversation_controls
for update to authenticated
using (org_id = public.current_org_id() and owner_user_id = auth.uid())
with check (org_id = public.current_org_id() and owner_user_id = auth.uid());
create policy ai_conversation_controls_owner_delete on public.ai_conversation_controls
for delete to authenticated
using (org_id = public.current_org_id() and owner_user_id = auth.uid());

commit;
