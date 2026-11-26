-- 26/11/2026: avisar a Dra. de todo agendamento (inclusive os da Helena) e reduzir alarme falso de urgência.
create or replace function public.enqueue_appointment_owner_alert()
returns trigger language plpgsql set search_path to 'public' as $function$
declare r record; cname text; msg text; src text;
begin
 if lower(coalesce(new.event_type,'')) in ('meeting','appointment','consultation','consultation_online','client_consultation')
    and new.status = 'scheduled' and new.starts_at > now()
    and (tg_op='INSERT' or old.starts_at is distinct from new.starts_at) then
  select name into cname from public.clients where id=new.client_id and org_id=new.org_id;
  msg:='LEXOFFICE • '||case when tg_op='INSERT' then 'NOVO AGENDAMENTO' else 'AGENDAMENTO REMARCADO' end
    ||E'\n'||coalesce('Cliente: '||cname, new.title, 'Contato não identificado')
    ||E'\nProfissional: '||coalesce((select name from public.profiles where id=new.responsible_id),'não definido')
    ||E'\nData/Hora: '||to_char(new.starts_at at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')
    ||E'\nAbra na LEX: https://lexoffice.univittagroup.com.br/agenda';
  for r in select distinct regexp_replace(x.phone,'\D','','g') phone from (
      select alert_phone phone from public.whatsapp_settings where org_id=new.org_id and alerts_enabled=true
      union all select commercial_alert_phone from public.whatsapp_settings where org_id=new.org_id and alerts_enabled=true) x
    where nullif(regexp_replace(x.phone,'\D','','g'),'') is not null loop
   src:='appointment_staff_alert:'||new.id::text||':'||extract(epoch from new.starts_at)::bigint||':'||r.phone;
   if not exists(select 1 from public.notification_queue q where q.payload->>'source'=src) then
    begin
     insert into public.notification_queue(org_id,client_id,channel,destination,message,payload,scheduled_at,status,owner_user_id,send_to_client_app)
     values(new.org_id,new.client_id,'whatsapp',r.phone,msg,jsonb_build_object('source',src,'event_id',new.id),now(),'pending',coalesce(new.owner_user_id,new.responsible_id),false);
    exception when others then raise warning 'appointment_staff_alert falhou: %', sqlerrm; -- o agendamento nunca pode falhar por causa do aviso
    end;
   end if;
  end loop;
 end if;
 return new;
end $function$;

-- Vigia de urgência: cliente cadastrado sempre avisa; desconhecido não avisa se for telefone fixo,
-- mensagem com link ou comunicado longo (propaganda, alerta da Defesa Civil etc.).
do $do$
declare d text; anchor text := 'if exists (select 1 from ai_agent_alerts a where';
begin
  select pg_get_functiondef('public.lex_vigia_urgencia'::regproc) into d;
  if position('filtro_comunicado' in d) = 0 then
    if position(anchor in d) = 0 then raise exception 'lex_vigia_urgencia mudou; revisar a migração'; end if;
    d := replace(d, anchor, $f$-- filtro_comunicado
  if v_client is null and (regexp_replace(coalesce(v_phone,''),'\D','','g') ~ '^55\d{2}[2-5]\d{7}$'
     or t ~ '(https?://|www\.|black friday|defesa civil)' or length(new.body) > 600) then return new; end if;
  $f$ || anchor);
    execute d;
  end if;
end $do$;

create or replace trigger trg_appointment_owner_alert
  after insert or update of meeting_url, starts_at on public.calendar_events
  for each row execute function public.enqueue_appointment_owner_alert();
