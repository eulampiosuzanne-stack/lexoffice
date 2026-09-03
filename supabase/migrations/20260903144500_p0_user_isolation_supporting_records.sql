-- Supporting user isolation and removal of same-org visibility shortcuts.

alter table public.integration_connections add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;
alter table public.generated_documents add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;
alter table public.investigations add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;

update public.integration_connections i set owner_user_id=public.lexoffice_default_owner_for_org(i.org_id) where owner_user_id is null;
update public.generated_documents g set owner_user_id=coalesce((select p.id from public.profiles p where p.id=g.created_by and p.org_id=g.org_id),(select p.owner_user_id from public.processes p where p.id=g.process_id and p.org_id=g.org_id),(select c.owner_user_id from public.clients c where c.id=g.client_id and c.org_id=g.org_id),public.lexoffice_default_owner_for_org(g.org_id)) where owner_user_id is null;
update public.investigations i set owner_user_id=public.lexoffice_default_owner_for_org(i.org_id) where owner_user_id is null;

alter table public.integration_connections alter column owner_user_id set not null;
alter table public.generated_documents alter column owner_user_id set not null;
alter table public.investigations alter column owner_user_id set not null;

create index if not exists integration_connections_org_owner_idx on public.integration_connections(org_id,owner_user_id);
create index if not exists generated_documents_org_owner_idx on public.generated_documents(org_id,owner_user_id);
create index if not exists investigations_org_owner_idx on public.investigations(org_id,owner_user_id);

drop trigger if exists lexoffice_assign_owner on public.integration_connections;
create trigger lexoffice_assign_owner before insert on public.integration_connections for each row execute function public.lexoffice_assign_record_owner();
drop trigger if exists lexoffice_assign_owner on public.generated_documents;
create trigger lexoffice_assign_owner before insert on public.generated_documents for each row execute function public.lexoffice_assign_record_owner();
drop trigger if exists lexoffice_assign_owner on public.investigations;
create trigger lexoffice_assign_owner before insert on public.investigations for each row execute function public.lexoffice_assign_record_owner();

do $$ declare t text; pol record; begin
 foreach t in array array['integration_connections','generated_documents','investigations'] loop
   execute format('alter table public.%I enable row level security',t);
   for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy if exists %I on public.%I',pol.policyname,t); end loop;
   execute format('create policy %I on public.%I for select to authenticated using (org_id=current_org_id() and owner_user_id=auth.uid())',t||'_owner_select',t);
   execute format('create policy %I on public.%I for insert to authenticated with check (org_id=current_org_id() and owner_user_id=auth.uid())',t||'_owner_insert',t);
   execute format('create policy %I on public.%I for update to authenticated using (org_id=current_org_id() and owner_user_id=auth.uid()) with check (org_id=current_org_id() and owner_user_id=auth.uid())',t||'_owner_update',t);
   execute format('create policy %I on public.%I for delete to authenticated using (org_id=current_org_id() and owner_user_id=auth.uid())',t||'_owner_delete',t);
 end loop;
end $$;

drop policy if exists profiles_select_same_org on public.profiles;
create policy profiles_select_self on public.profiles for select to authenticated using (id=auth.uid());

do $$ declare pol record; begin for pol in select policyname from pg_policies where schemaname='public' and tablename='ai_conversations' loop execute format('drop policy if exists %I on public.ai_conversations',pol.policyname); end loop; end $$;
create policy ai_conversations_user_select on public.ai_conversations for select to authenticated using (org_id=current_org_id() and user_id=auth.uid());
create policy ai_conversations_user_insert on public.ai_conversations for insert to authenticated with check (org_id=current_org_id() and user_id=auth.uid());
create policy ai_conversations_user_update on public.ai_conversations for update to authenticated using (org_id=current_org_id() and user_id=auth.uid()) with check (org_id=current_org_id() and user_id=auth.uid());
create policy ai_conversations_user_delete on public.ai_conversations for delete to authenticated using (org_id=current_org_id() and user_id=auth.uid());

do $$ declare pol record; begin for pol in select policyname from pg_policies where schemaname='public' and tablename='ai_messages' loop execute format('drop policy if exists %I on public.ai_messages',pol.policyname); end loop; end $$;
create policy ai_messages_user_select on public.ai_messages for select to authenticated using (org_id=current_org_id() and exists(select 1 from public.ai_conversations c where c.id=conversation_id and c.user_id=auth.uid()));
create policy ai_messages_user_insert on public.ai_messages for insert to authenticated with check (org_id=current_org_id() and exists(select 1 from public.ai_conversations c where c.id=conversation_id and c.user_id=auth.uid()));
create policy ai_messages_user_update on public.ai_messages for update to authenticated using (org_id=current_org_id() and exists(select 1 from public.ai_conversations c where c.id=conversation_id and c.user_id=auth.uid())) with check (org_id=current_org_id() and exists(select 1 from public.ai_conversations c where c.id=conversation_id and c.user_id=auth.uid()));
create policy ai_messages_user_delete on public.ai_messages for delete to authenticated using (org_id=current_org_id() and exists(select 1 from public.ai_conversations c where c.id=conversation_id and c.user_id=auth.uid()));

do $$ declare t text; pol record; begin
 foreach t in array array['notifications','investigation_batches','investigation_searches','oab_import_batches','process_sync_logs','tribunal_connections'] loop
   execute format('alter table public.%I enable row level security',t);
   for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy if exists %I on public.%I',pol.policyname,t); end loop;
   execute format('create policy %I on public.%I for select to authenticated using (org_id=current_org_id() and user_id=auth.uid())',t||'_user_select',t);
   execute format('create policy %I on public.%I for insert to authenticated with check (org_id=current_org_id() and user_id=auth.uid())',t||'_user_insert',t);
   execute format('create policy %I on public.%I for update to authenticated using (org_id=current_org_id() and user_id=auth.uid()) with check (org_id=current_org_id() and user_id=auth.uid())',t||'_user_update',t);
   execute format('create policy %I on public.%I for delete to authenticated using (org_id=current_org_id() and user_id=auth.uid())',t||'_user_delete',t);
 end loop;
end $$;

do $$ declare pol record; begin for pol in select policyname from pg_policies where schemaname='public' and tablename='investigation_batch_items' loop execute format('drop policy if exists %I on public.investigation_batch_items',pol.policyname); end loop; end $$;
create policy investigation_batch_items_user_select on public.investigation_batch_items for select to authenticated using (org_id=current_org_id() and exists(select 1 from public.investigation_batches b where b.id=batch_id and b.user_id=auth.uid()));

drop policy if exists tenant_select on public.audit_logs;
drop policy if exists tenant_insert on public.audit_logs;
drop policy if exists tenant_update on public.audit_logs;
drop policy if exists tenant_delete on public.audit_logs;
create policy audit_logs_user_select on public.audit_logs for select to authenticated using (org_id=current_org_id() and user_id=auth.uid());
create policy audit_logs_user_insert on public.audit_logs for insert to authenticated with check (org_id=current_org_id() and user_id=auth.uid());
