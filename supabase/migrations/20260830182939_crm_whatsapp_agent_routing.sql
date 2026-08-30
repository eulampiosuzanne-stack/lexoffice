create or replace function public.crm_attach_whatsapp_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
  v_phone text;
  v_name text;
begin
  if new.client_id is not null or new.lead_id is not null then
    return new;
  end if;
  v_phone := regexp_replace(coalesce(new.phone,''),'\D','','g');
  if v_phone = '' then return new; end if;
  select l.id into v_lead_id from public.leads l
  where l.org_id = new.org_id
    and (regexp_replace(coalesce(l.phone,''),'\D','','g') = v_phone or regexp_replace(coalesce(l.whatsapp,''),'\D','','g') = v_phone)
  order by l.updated_at desc limit 1;
  if v_lead_id is null then
    v_name := coalesce(nullif(trim(new.name),''),nullif(trim(new.profile_name),''),'WhatsApp '||v_phone);
    insert into public.leads(org_id,name,phone,whatsapp,origin,stage_key,notes,updated_at)
    values(new.org_id,v_name,v_phone,v_phone,'whatsapp','novo_lead','Criado automaticamente a partir do atendimento no WhatsApp.',now()) returning id into v_lead_id;
  end if;
  new.lead_id := v_lead_id;
  return new;
end;
$$;

drop trigger if exists trg_crm_attach_whatsapp_lead on public.whatsapp_contacts;
create trigger trg_crm_attach_whatsapp_lead before insert or update of phone,client_id,lead_id on public.whatsapp_contacts for each row execute function public.crm_attach_whatsapp_lead();

create or replace function public.crm_propagate_contact_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_client uuid; v_lead uuid;
begin
  if new.contact_id is null then return new; end if;
  select client_id,lead_id into v_client,v_lead from public.whatsapp_contacts where id=new.contact_id and org_id=new.org_id;
  new.client_id := coalesce(new.client_id,v_client);
  new.lead_id := coalesce(new.lead_id,v_lead);
  return new;
end;
$$;

drop trigger if exists trg_crm_propagate_contact_links on public.whatsapp_conversations;
create trigger trg_crm_propagate_contact_links before insert or update of contact_id on public.whatsapp_conversations for each row execute function public.crm_propagate_contact_links();

create or replace function public.crm_sync_stage_from_agent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_stage text; v_target text;
begin
  if new.lead_id is null then return new; end if;
  select stage_key into v_stage from public.leads where id=new.lead_id and org_id=new.org_id;
  if v_stage is null or v_stage in ('contratado','cliente','perdido') then return new; end if;
  if 'contratado'=any(coalesce(new.tags,array[]::text[])) then v_target:='contratado';
  elsif 'cliente'=any(coalesce(new.tags,array[]::text[])) then v_target:='cliente';
  elsif 'perdido'=any(coalesce(new.tags,array[]::text[])) then v_target:='perdido';
  elsif 'agent:client_schedule_relationship'=any(coalesce(new.tags,array[]::text[])) and v_stage in ('novo_lead','contato_iniciado','qualificacao') then v_target:='consultoria';
  elsif 'agent:sales'=any(coalesce(new.tags,array[]::text[])) and v_stage in ('novo_lead','contato_iniciado') then v_target:='qualificacao';
  elsif 'agent:client_service_triage'=any(coalesce(new.tags,array[]::text[])) and v_stage='novo_lead' then v_target:='contato_iniciado';
  end if;
  if v_target is not null and v_target<>v_stage then update public.leads set stage_key=v_target,updated_at=now() where id=new.lead_id and org_id=new.org_id; end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_sync_stage_from_agent on public.whatsapp_conversations;
create trigger trg_crm_sync_stage_from_agent after insert or update of tags,lead_id on public.whatsapp_conversations for each row execute function public.crm_sync_stage_from_agent();

revoke all on function public.crm_attach_whatsapp_lead() from public,anon,authenticated;
revoke all on function public.crm_propagate_contact_links() from public,anon,authenticated;
revoke all on function public.crm_sync_stage_from_agent() from public,anon,authenticated;