-- Strict per-user data isolation for human/operational records.
-- Each record gets owner_user_id. RLS requires both org and authenticated owner.

create or replace function public.lexoffice_default_owner_for_org(p_org_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.org_id = p_org_id
  order by case when p.role_key = 'owner' then 0 else 1 end, p.created_at nulls last, p.id
  limit 1
$$;

revoke all on function public.lexoffice_default_owner_for_org(uuid) from public, anon, authenticated;
grant execute on function public.lexoffice_default_owner_for_org(uuid) to service_role;

alter table public.clients add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;
alter table public.processes add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;
alter table public.process_movements add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;
alter table public.process_deadlines add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;
alter table public.process_hearings add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;
alter table public.documents add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;
alter table public.financial_entries add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;
alter table public.fee_contracts add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;
alter table public.fee_installments add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;
alter table public.collection_schedule add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;
alter table public.payment_links add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;
alter table public.payment_receipts add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;
alter table public.calendar_events add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;
alter table public.calendar_sync_links add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;
alter table public.leads add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;
alter table public.lead_activities add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;
alter table public.whatsapp_contacts add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;
alter table public.whatsapp_conversations add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;
alter table public.whatsapp_messages add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;
alter table public.signature_requests add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;
alter table public.signature_signers add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;
alter table public.signature_events add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;

update public.clients c set owner_user_id=public.lexoffice_default_owner_for_org(c.org_id) where c.owner_user_id is null;
update public.leads l set owner_user_id=coalesce((select p.id from public.profiles p where p.id=l.responsible_id and p.org_id=l.org_id),(select c.owner_user_id from public.clients c where c.id=l.client_id and c.org_id=l.org_id),public.lexoffice_default_owner_for_org(l.org_id)) where l.owner_user_id is null;
update public.processes p0 set owner_user_id=coalesce((select p.id from public.profiles p where p.id=p0.responsible_id and p.org_id=p0.org_id),(select c.owner_user_id from public.clients c where c.id=p0.client_id and c.org_id=p0.org_id),public.lexoffice_default_owner_for_org(p0.org_id)) where p0.owner_user_id is null;
update public.calendar_events e set owner_user_id=coalesce((select p.id from public.profiles p where p.id=e.responsible_id and p.org_id=e.org_id),(select pr.owner_user_id from public.processes pr where pr.id=e.process_id and pr.org_id=e.org_id),(select c.owner_user_id from public.clients c where c.id=e.client_id and c.org_id=e.org_id),public.lexoffice_default_owner_for_org(e.org_id)) where e.owner_user_id is null;
update public.documents d set owner_user_id=coalesce((select p.id from public.profiles p where p.id=d.uploaded_by and p.org_id=d.org_id),(select pr.owner_user_id from public.processes pr where pr.id=d.process_id and pr.org_id=d.org_id),(select c.owner_user_id from public.clients c where c.id=d.client_id and c.org_id=d.org_id),public.lexoffice_default_owner_for_org(d.org_id)) where d.owner_user_id is null;
update public.financial_entries f set owner_user_id=coalesce((select p.id from public.profiles p where p.id=f.created_by and p.org_id=f.org_id),(select pr.owner_user_id from public.processes pr where pr.id=f.process_id and pr.org_id=f.org_id),(select c.owner_user_id from public.clients c where c.id=f.client_id and c.org_id=f.org_id),public.lexoffice_default_owner_for_org(f.org_id)) where f.owner_user_id is null;
update public.process_movements m set owner_user_id=coalesce((select p.id from public.profiles p where p.id=m.created_by and p.org_id=m.org_id),(select pr.owner_user_id from public.processes pr where pr.id=m.process_id and pr.org_id=m.org_id),public.lexoffice_default_owner_for_org(m.org_id)) where m.owner_user_id is null;
update public.process_deadlines d set owner_user_id=coalesce((select p.id from public.profiles p where p.id=d.responsible_id and p.org_id=d.org_id),(select pr.owner_user_id from public.processes pr where pr.id=d.process_id and pr.org_id=d.org_id),(select c.owner_user_id from public.clients c where c.id=d.client_id and c.org_id=d.org_id),public.lexoffice_default_owner_for_org(d.org_id)) where d.owner_user_id is null;
update public.process_hearings h set owner_user_id=coalesce((select p.id from public.profiles p where p.id=h.created_by and p.org_id=h.org_id),(select pr.owner_user_id from public.processes pr where pr.id=h.process_id and pr.org_id=h.org_id),(select c.owner_user_id from public.clients c where c.id=h.client_id and c.org_id=h.org_id),public.lexoffice_default_owner_for_org(h.org_id)) where h.owner_user_id is null;
update public.fee_contracts f set owner_user_id=coalesce((select p.id from public.profiles p where p.id=f.responsible_id and p.org_id=f.org_id),(select p.id from public.profiles p where p.id=f.created_by and p.org_id=f.org_id),(select pr.owner_user_id from public.processes pr where pr.id=f.process_id and pr.org_id=f.org_id),(select c.owner_user_id from public.clients c where c.id=f.client_id and c.org_id=f.org_id),public.lexoffice_default_owner_for_org(f.org_id)) where f.owner_user_id is null;
update public.fee_installments i set owner_user_id=coalesce((select f.owner_user_id from public.fee_contracts f where f.id=i.contract_id and f.org_id=i.org_id),(select pr.owner_user_id from public.processes pr where pr.id=i.process_id and pr.org_id=i.org_id),(select c.owner_user_id from public.clients c where c.id=i.client_id and c.org_id=i.org_id),public.lexoffice_default_owner_for_org(i.org_id)) where i.owner_user_id is null;
update public.collection_schedule s set owner_user_id=coalesce((select i.owner_user_id from public.fee_installments i where i.id=s.installment_id and i.org_id=s.org_id),(select f.owner_user_id from public.fee_contracts f where f.id=s.contract_id and f.org_id=s.org_id),(select c.owner_user_id from public.clients c where c.id=s.client_id and c.org_id=s.org_id),public.lexoffice_default_owner_for_org(s.org_id)) where s.owner_user_id is null;
update public.payment_links l set owner_user_id=coalesce((select i.owner_user_id from public.fee_installments i where i.id=l.installment_id and i.org_id=l.org_id),public.lexoffice_default_owner_for_org(l.org_id)) where l.owner_user_id is null;
update public.payment_receipts r set owner_user_id=coalesce((select p.id from public.profiles p where p.id=r.registered_by and p.org_id=r.org_id),(select i.owner_user_id from public.fee_installments i where i.id=r.installment_id and i.org_id=r.org_id),(select f.owner_user_id from public.fee_contracts f where f.id=r.contract_id and f.org_id=r.org_id),(select c.owner_user_id from public.clients c where c.id=r.client_id and c.org_id=r.org_id),public.lexoffice_default_owner_for_org(r.org_id)) where r.owner_user_id is null;
update public.calendar_sync_links l set owner_user_id=coalesce((select e.owner_user_id from public.calendar_events e where e.id=l.calendar_event_id and e.org_id=l.org_id),public.lexoffice_default_owner_for_org(l.org_id)) where l.owner_user_id is null;
update public.lead_activities a set owner_user_id=coalesce((select p.id from public.profiles p where p.id=a.created_by and p.org_id=a.org_id),(select l.owner_user_id from public.leads l where l.id=a.lead_id and l.org_id=a.org_id),public.lexoffice_default_owner_for_org(a.org_id)) where a.owner_user_id is null;
update public.whatsapp_contacts c set owner_user_id=coalesce((select cl.owner_user_id from public.clients cl where cl.id=c.client_id and cl.org_id=c.org_id),(select l.owner_user_id from public.leads l where l.id=c.lead_id and l.org_id=c.org_id),public.lexoffice_default_owner_for_org(c.org_id)) where c.owner_user_id is null;
update public.whatsapp_conversations c set owner_user_id=coalesce((select p.id from public.profiles p where p.id=c.responsible_id and p.org_id=c.org_id),(select cl.owner_user_id from public.clients cl where cl.id=c.client_id and cl.org_id=c.org_id),(select pr.owner_user_id from public.processes pr where pr.id=c.process_id and pr.org_id=c.org_id),(select l.owner_user_id from public.leads l where l.id=c.lead_id and l.org_id=c.org_id),(select wc.owner_user_id from public.whatsapp_contacts wc where wc.id=c.contact_id and wc.org_id=c.org_id),public.lexoffice_default_owner_for_org(c.org_id)) where c.owner_user_id is null;
update public.whatsapp_messages m set owner_user_id=coalesce((select p.id from public.profiles p where p.id=m.sent_by and p.org_id=m.org_id),(select c.owner_user_id from public.whatsapp_conversations c where c.id=m.conversation_id and c.org_id=m.org_id),public.lexoffice_default_owner_for_org(m.org_id)) where m.owner_user_id is null;
update public.signature_requests s set owner_user_id=coalesce((select p.id from public.profiles p where p.id=s.created_by and p.org_id=s.org_id),(select d.owner_user_id from public.documents d where d.id=s.document_id and d.org_id=s.org_id),(select pr.owner_user_id from public.processes pr where pr.id=s.process_id and pr.org_id=s.org_id),(select c.owner_user_id from public.clients c where c.id=s.client_id and c.org_id=s.org_id),public.lexoffice_default_owner_for_org(s.org_id)) where s.owner_user_id is null;
update public.signature_signers s set owner_user_id=coalesce((select r.owner_user_id from public.signature_requests r where r.id=s.signature_request_id and r.org_id=s.org_id),public.lexoffice_default_owner_for_org(s.org_id)) where s.owner_user_id is null;
update public.signature_events e set owner_user_id=coalesce((select r.owner_user_id from public.signature_requests r where r.id=e.signature_request_id and r.org_id=e.org_id),public.lexoffice_default_owner_for_org(e.org_id)) where e.owner_user_id is null;

create or replace function public.lexoffice_assign_record_owner()
returns trigger language plpgsql security definer set search_path=public as $$
declare j jsonb:=to_jsonb(new); candidate uuid; rid uuid;
begin
  if new.owner_user_id is not null then return new; end if;
  if auth.uid() is not null then new.owner_user_id:=auth.uid(); return new; end if;
  begin rid:=nullif(j->>'responsible_id','')::uuid; exception when others then rid:=null; end;
  if rid is null then begin rid:=nullif(j->>'created_by','')::uuid; exception when others then rid:=null; end; end if;
  if rid is null then begin rid:=nullif(j->>'uploaded_by','')::uuid; exception when others then rid:=null; end; end if;
  if rid is null then begin rid:=nullif(j->>'sent_by','')::uuid; exception when others then rid:=null; end; end if;
  if rid is null then begin rid:=nullif(j->>'registered_by','')::uuid; exception when others then rid:=null; end; end if;
  if rid is not null then select p.id into candidate from public.profiles p where p.id=rid and p.org_id=new.org_id limit 1; end if;
  if candidate is null and nullif(j->>'process_id','') is not null then select p.owner_user_id into candidate from public.processes p where p.id=(j->>'process_id')::uuid and p.org_id=new.org_id; end if;
  if candidate is null and nullif(j->>'client_id','') is not null then select c.owner_user_id into candidate from public.clients c where c.id=(j->>'client_id')::uuid and c.org_id=new.org_id; end if;
  if candidate is null and nullif(j->>'lead_id','') is not null then select l.owner_user_id into candidate from public.leads l where l.id=(j->>'lead_id')::uuid and l.org_id=new.org_id; end if;
  if candidate is null and nullif(j->>'conversation_id','') is not null then select c.owner_user_id into candidate from public.whatsapp_conversations c where c.id=(j->>'conversation_id')::uuid and c.org_id=new.org_id; end if;
  if candidate is null and nullif(j->>'calendar_event_id','') is not null then select e.owner_user_id into candidate from public.calendar_events e where e.id=(j->>'calendar_event_id')::uuid and e.org_id=new.org_id; end if;
  if candidate is null and nullif(j->>'contract_id','') is not null then select c.owner_user_id into candidate from public.fee_contracts c where c.id=(j->>'contract_id')::uuid and c.org_id=new.org_id; end if;
  if candidate is null and nullif(j->>'installment_id','') is not null then select i.owner_user_id into candidate from public.fee_installments i where i.id=(j->>'installment_id')::uuid and i.org_id=new.org_id; end if;
  if candidate is null and nullif(j->>'signature_request_id','') is not null then select r.owner_user_id into candidate from public.signature_requests r where r.id=(j->>'signature_request_id')::uuid and r.org_id=new.org_id; end if;
  new.owner_user_id:=coalesce(candidate,public.lexoffice_default_owner_for_org(new.org_id));
  if new.owner_user_id is null then raise exception 'No owner user available for organization %',new.org_id using errcode='23514'; end if;
  return new;
end $$;
revoke all on function public.lexoffice_assign_record_owner() from public,anon,authenticated;
grant execute on function public.lexoffice_assign_record_owner() to service_role;

do $$ declare t text; begin
  foreach t in array array['clients','processes','process_movements','process_deadlines','process_hearings','documents','financial_entries','fee_contracts','fee_installments','collection_schedule','payment_links','payment_receipts','calendar_events','calendar_sync_links','leads','lead_activities','whatsapp_contacts','whatsapp_conversations','whatsapp_messages','signature_requests','signature_signers','signature_events'] loop
    execute format('drop trigger if exists lexoffice_assign_owner on public.%I',t);
    execute format('create trigger lexoffice_assign_owner before insert on public.%I for each row execute function public.lexoffice_assign_record_owner()',t);
    execute format('create index if not exists %I on public.%I (org_id, owner_user_id)',t||'_org_owner_idx',t);
  end loop;
end $$;

do $$ declare t text; n bigint; begin
  foreach t in array array['clients','processes','process_movements','process_deadlines','process_hearings','documents','financial_entries','fee_contracts','fee_installments','collection_schedule','payment_links','payment_receipts','calendar_events','calendar_sync_links','leads','lead_activities','whatsapp_contacts','whatsapp_conversations','whatsapp_messages','signature_requests','signature_signers','signature_events'] loop
    execute format('select count(*) from public.%I where owner_user_id is null',t) into n;
    if n>0 then raise exception 'Ownership backfill incomplete for %, % rows',t,n; end if;
    execute format('alter table public.%I alter column owner_user_id set not null',t);
  end loop;
end $$;

do $$ declare t text; pol record; begin
  foreach t in array array['clients','processes','process_movements','process_deadlines','process_hearings','documents','financial_entries','fee_contracts','fee_installments','collection_schedule','payment_links','payment_receipts','calendar_events','calendar_sync_links','leads','lead_activities','whatsapp_contacts','whatsapp_conversations','whatsapp_messages','signature_requests','signature_signers','signature_events'] loop
    execute format('alter table public.%I enable row level security',t);
    for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy if exists %I on public.%I',pol.policyname,t); end loop;
    execute format('create policy %I on public.%I for select to authenticated using (org_id=current_org_id() and owner_user_id=auth.uid())',t||'_owner_select',t);
    execute format('create policy %I on public.%I for insert to authenticated with check (org_id=current_org_id() and owner_user_id=auth.uid())',t||'_owner_insert',t);
    execute format('create policy %I on public.%I for update to authenticated using (org_id=current_org_id() and owner_user_id=auth.uid()) with check (org_id=current_org_id() and owner_user_id=auth.uid())',t||'_owner_update',t);
    execute format('create policy %I on public.%I for delete to authenticated using (org_id=current_org_id() and owner_user_id=auth.uid())',t||'_owner_delete',t);
  end loop;
end $$;
