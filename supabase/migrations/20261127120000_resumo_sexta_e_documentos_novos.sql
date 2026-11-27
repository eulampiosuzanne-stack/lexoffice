-- Aplicada em produção em 27/11/2026.
alter table public.client_document_requests add column if not exists reminder_count int not null default 0;

-- Resumo de sexta, só para a Dra.
create or replace function public.lexoffice_friday_summary(p_org uuid) returns text
language plpgsql security definer set search_path='' as $f$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  seg date := date_trunc('week', (now() at time zone 'America/Sao_Paulo'))::date;
  v_rec numeric; v_n int; v_total numeric; v_top text; v_agenda text; v_prazos int; v_docs int;
begin
  select coalesce(sum(amount),0) into v_rec from public.financial_entries
   where org_id=p_org and type='income' and status='paid' and (paid_at at time zone 'America/Sao_Paulo')::date >= seg;
  with atr as (
    select f.client_id, f.amount - coalesce((select sum(p.amount) from public.financial_entry_payments p where p.financial_entry_id=f.id),0) saldo
      from public.financial_entries f left join public.clients c on c.id=f.client_id
     where f.org_id=p_org and f.type='income' and f.status in ('pending','overdue','partial') and f.due_date < hoje and not coalesce(c.is_demo,false)
  ), por as (
    select coalesce(c.name,'Sem nome') nome, sum(a.saldo) s from atr a left join public.clients c on c.id=a.client_id group by 1
  )
  select (select count(*) from atr), (select coalesce(sum(saldo),0) from atr),
         (select string_agg('• '||nome||' — R$ '||translate(to_char(s,'FM999,999,990.00'),',.','.,'), E'\n' order by s desc) from (select * from por order by s desc limit 5) t)
    into v_n, v_total, v_top;
  select string_agg('• '||to_char(starts_at at time zone 'America/Sao_Paulo','DD/MM HH24:MI')||' '||left(title,60), E'\n' order by starts_at),
         null into v_agenda
    from (select starts_at,title from public.calendar_events
           where org_id=p_org and status='scheduled' and coalesce(event_type,'') not in ('deadline','task','reminder')
             and (starts_at at time zone 'America/Sao_Paulo')::date between seg+7 and seg+13
           order by starts_at limit 10) e;
  select count(*) into v_prazos from public.calendar_events
   where org_id=p_org and status='scheduled' and event_type='deadline' and (starts_at at time zone 'America/Sao_Paulo')::date between seg+7 and seg+13;
  select count(*) into v_docs from public.client_document_requests where org_id=p_org and status='pending';
  return '📊 RESUMO DE SEXTA — '||to_char(hoje,'DD/MM')
    ||E'\n\n💰 Entrou na semana: R$ '||translate(to_char(v_rec,'FM999,999,990.00'),',.','.,')
    ||E'\n\n⏰ Em atraso: '||v_n||' parcela(s), R$ '||translate(to_char(v_total,'FM999,999,990.00'),',.','.,')
    ||coalesce(E'\nMaiores:\n'||v_top,'')
    ||E'\n\n📅 Semana que vem:\n'||coalesce(v_agenda,'Nada marcado.')
    ||E'\nPrazos na agenda: '||v_prazos
    ||E'\n\n📎 Documentos pendentes: '||v_docs;
end $f$;

create or replace function public.lexoffice_send_friday_summary() returns int
language plpgsql security definer set search_path='' as $f$
declare r record; v_src text; n int := 0;
begin
  for r in select w.org_id, regexp_replace(w.alert_phone,'\D','','g') phone,
             (select p.id from public.profiles p where p.org_id=w.org_id and p.role_key='owner' and p.status='active' limit 1) owner
           from public.whatsapp_settings w where w.alerts_enabled and coalesce(w.alert_phone,'')<>'' loop
    v_src := 'friday_summary:'||r.org_id||':'||(now() at time zone 'America/Sao_Paulo')::date;
    if r.owner is null or exists(select 1 from public.notification_queue q where q.payload->>'source'=v_src) then continue; end if;
    insert into public.notification_queue(org_id,channel,destination,message,payload,scheduled_at,status,owner_user_id,send_to_client_app)
    values(r.org_id,'whatsapp',r.phone,public.lexoffice_friday_summary(r.org_id),jsonb_build_object('source',v_src,'agent_key','system'),now(),'pending',r.owner,false);
    n := n+1;
  end loop;
  return n;
end $f$;

-- Cobrança gentil só dos documentos pedidos a partir de 27/11/2026: até 3 avisos, com 3 dias de intervalo.
create or replace function public.lexoffice_remind_new_documents() returns int
language plpgsql security definer set search_path='' as $f$
declare r record; n int := 0;
begin
  for r in
    select d.org_id, d.client_id, c.name, regexp_replace(coalesce(nullif(c.whatsapp,''),c.phone,''),'\D','','g') phone,
           (array_agg(coalesce(c.owner_user_id, d.requested_by)))[1] owner, array_agg(d.id) ids,
           string_agg('📎 '||d.title, E'\n' order by d.created_at) lista
      from public.client_document_requests d join public.clients c on c.id=d.client_id and c.org_id=d.org_id
     where d.status='pending' and not coalesce(d.requires_authorization,false)
       and d.created_at >= timestamptz '2026-11-27 00:00-03' and d.created_at < now() - interval '1 day'
       and (d.reminder_last_sent_at is null or d.reminder_last_sent_at < now() - interval '3 days' + interval '1 hour')
       and d.reminder_count < 3 and c.status='active' and not coalesce(c.is_demo,false)
     group by d.org_id, d.client_id, c.name, c.whatsapp, c.phone
  loop
    if length(r.phone) < 10 or r.owner is null then continue; end if;
    insert into public.notification_queue(org_id,client_id,channel,destination,message,payload,scheduled_at,status,owner_user_id,send_to_client_app)
    values(r.org_id,r.client_id,'whatsapp',r.phone,
      'Oi, '||initcap(split_part(btrim(r.name),' ',1))||'! 😊 Aqui é a Helena.'||E'\n\nPara seguirmos, ainda falta:\n'||r.lista
      ||E'\n\nPode enviar pelo app:\n👉 https://lexoffice.univittagroup.com.br/cliente\n\nSe já enviou, é só me avisar.',
      jsonb_build_object('source','document_reminder','agent_key','customer_success'),now(),'pending',r.owner,false);
    update public.client_document_requests set reminder_last_sent_at=now(), reminder_count=reminder_count+1 where id = any(r.ids);
    n := n+1;
  end loop;
  return n;
end $f$;

revoke all on function public.lexoffice_friday_summary(uuid), public.lexoffice_send_friday_summary(), public.lexoffice_remind_new_documents() from public, anon, authenticated;

select cron.schedule('lexoffice-friday-summary','0 20 * * 5','select public.lexoffice_send_friday_summary()');
select cron.schedule('lexoffice-document-reminders','10 13 * * 1-5','select public.lexoffice_remind_new_documents()');
