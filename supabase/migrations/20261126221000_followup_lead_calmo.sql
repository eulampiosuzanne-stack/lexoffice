-- 26/11/2026 (Dra. Suzanne): retomada só para lead, uma única mensagem, sem insistir.
-- Quem pode receber: lead em fase inicial, que escreveu, ficou 3 a 10 dias sem responder à nossa última mensagem,
-- sem atendimento humano nos últimos 7 dias, sem recusa e sem retomada anterior.
create or replace function public.lexoffice_lead_followup_candidates()
returns table(lead_id uuid, org_id uuid, destination text, first_name text)
language sql stable security definer set search_path to 'public' as $$
  select distinct on (public.br_phone_core(ct.phone))
         l.id, l.org_id, ct.phone,
         case when lower(split_part(btrim(coalesce(l.name,'')),' ',1))='whatsapp'
                or split_part(btrim(coalesce(l.name,'')),' ',1) ~ '[0-9]' then ''
              else split_part(btrim(coalesce(l.name,'')),' ',1) end
  from leads l
  join whatsapp_settings ws on ws.org_id=l.org_id and ws.followup_enabled
  join whatsapp_contacts ct on ct.org_id=l.org_id
   and public.br_phone_core(ct.phone)=public.br_phone_core(coalesce(nullif(btrim(l.whatsapp),''),l.phone))
  join whatsapp_conversations cv on cv.contact_id=ct.id and cv.org_id=l.org_id
  join lateral (select max(created_at) filter (where direction='inbound') li,
                       max(created_at) filter (where direction='outbound') lo
                  from whatsapp_messages m where m.conversation_id=cv.id) t on true
  where l.client_id is null and cv.client_id is null and ct.client_id is null
    and l.stage_key in ('novo_lead','contato_iniciado','qualificacao')
    and cv.bot_ativo and not coalesce(ct.is_blocked,false)
    and coalesce(ct.tags::text,'') !~* '(pessoal|nao_responder|bloqueado_envio)'
    and t.lo > t.li
    and t.li < now()-interval '3 days' and t.li > now()-interval '10 days'
    and (cv.last_human_outbound_at is null or cv.last_human_outbound_at < now()-interval '7 days')
    and not exists (select 1 from whatsapp_messages m where m.conversation_id=cv.id and m.direction='inbound'
          and m.body ~* '\m(sair|pare|parar|n[aã]o quero|n[aã]o tenho interesse|sem interesse|desisti|j[aá] contratei|j[aá] resolvi)\M')
    and not exists (select 1 from notification_queue q where q.org_id=l.org_id and q.payload->>'source'='whatsapp_followup'
          and (q.payload->>'lead_id'=l.id::text or public.br_phone_core(q.destination)=public.br_phone_core(ct.phone)))
    and public.lexoffice_lead_recovery_eligible(l.id)
  order by public.br_phone_core(ct.phone), t.li desc
$$;
revoke all on function public.lexoffice_lead_followup_candidates() from public, anon, authenticated;

create or replace function public.lexoffice_sync_lost_lead_followups()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n int:=0; agora timestamp := now() at time zone 'America/Sao_Paulo';
begin
  -- Só em dia útil, das 9h às 17h; no máximo 3 por rodada.
  if extract(isodow from agora) > 5 or extract(hour from agora) not between 9 and 16 then return 0; end if;
  insert into notification_queue(org_id,channel,destination,message,payload,scheduled_at,status)
  select c.org_id,'whatsapp',c.destination,
    case when c.first_name<>'' then 'Olá, '||c.first_name||'.' else 'Olá.' end
      ||' Se ainda precisar de orientação sobre o seu caso, é só responder por aqui. Ficamos à disposição.',
    jsonb_build_object('source','whatsapp_followup','kind','sales_recovery','lead_id',c.lead_id,'attempt',1,'agent_key','commercial_followup'),
    now(),'pending'
  from lexoffice_lead_followup_candidates() c limit 3;
  get diagnostics n = row_count;
  return n;
end $$;

-- Quem responder tem a retomada pendente cancelada (as de lead não guardam conversation_id).
create or replace function public.lexoffice_cancel_lead_followup_on_reply()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.direction='inbound' then
    begin
      update notification_queue q set status='cancelled', last_error='Lead respondeu', updated_at=now()
        from whatsapp_conversations v join whatsapp_contacts c on c.id=v.contact_id
       where v.id=new.conversation_id and q.org_id=new.org_id and q.status='pending'
         and q.payload->>'kind'='sales_recovery'
         and public.br_phone_core(q.destination)=public.br_phone_core(c.phone);
    exception when others then raise warning 'cancel_lead_followup: %', sqlerrm;
    end;
  end if;
  return new;
end $$;
drop trigger if exists trg_cancel_lead_followup_on_reply on public.whatsapp_messages;
create trigger trg_cancel_lead_followup_on_reply after insert on public.whatsapp_messages
  for each row execute function public.lexoffice_cancel_lead_followup_on_reply();
