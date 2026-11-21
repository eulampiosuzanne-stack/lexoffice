-- Catálogo: o funil só avança por fato confirmado.
-- 1) Link de pagamento gerado para o lead  -> "aguardando_pagamento".
-- 2) Recibo/baixa registrado para o lead   -> "consulta_paga".
-- Só atua em lead ainda ANTES da consulta; honorários de lead já em proposta/negociação/contratado/cliente não mexem no funil.
create or replace function public.crm_funnel_on_payment_link()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.lead_id is not null and coalesce(lower(new.status),'') not in ('cancelled','canceled','expired') then
      update public.leads set stage_key='aguardando_pagamento', updated_at=now()
       where id=new.lead_id and org_id=new.org_id
         and stage_key in ('novo_lead','contato_iniciado','em_triagem','qualificacao','consultoria','consulta_apresentada');
    end if;
  exception when others then raise warning 'crm_funnel_on_payment_link: %', sqlerrm; end;
  return new;
end $$;

create or replace function public.crm_funnel_on_payment_receipt()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.lead_id is not null then
      update public.leads set stage_key='consulta_paga', updated_at=now()
       where id=new.lead_id and org_id=new.org_id
         and stage_key in ('novo_lead','contato_iniciado','em_triagem','qualificacao','consultoria','consulta_apresentada','aguardando_pagamento','pagamento_conferencia');
    end if;
  exception when others then raise warning 'crm_funnel_on_payment_receipt: %', sqlerrm; end;
  return new;
end $$;

revoke all on function public.crm_funnel_on_payment_link() from public, anon, authenticated;
revoke all on function public.crm_funnel_on_payment_receipt() from public, anon, authenticated;

drop trigger if exists trg_crm_funnel_payment_link on public.payment_links;
create trigger trg_crm_funnel_payment_link after insert on public.payment_links for each row execute function public.crm_funnel_on_payment_link();
drop trigger if exists trg_crm_funnel_payment_receipt on public.payment_receipts;
create trigger trg_crm_funnel_payment_receipt after insert on public.payment_receipts for each row execute function public.crm_funnel_on_payment_receipt();
