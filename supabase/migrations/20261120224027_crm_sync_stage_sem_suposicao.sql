-- Catálogo: não pular etapas por suposição.
-- Mantém: etiquetas manuais contratado/cliente/perdido e "triagem iniciada" (agente de triagem em lead novo).
-- Remove: agente de agenda -> consultoria e agente comercial -> qualificação (eram avanços por suposição).
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
  elsif 'agent:client_service_triage'=any(coalesce(new.tags,array[]::text[])) and v_stage='novo_lead' then v_target:='em_triagem';
  end if;
  if v_target is not null and v_target<>v_stage then update public.leads set stage_key=v_target,updated_at=now() where id=new.lead_id and org_id=new.org_id; end if;
  return new;
end;
$$;
