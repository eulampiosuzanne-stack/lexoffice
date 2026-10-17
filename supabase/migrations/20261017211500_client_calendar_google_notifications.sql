create or replace function public.guard_client_consultation_schedule()
returns trigger language plpgsql set search_path='public' as $$
declare v_start timestamp; v_end timestamp; v_expected uuid;
begin
 if new.org_id <> 'b3dd3ed0-2a05-4087-8220-307a44352cec'::uuid then return new; end if;
 if lower(coalesce(new.event_type,'')) not in ('consulta','consultation','client_consultation','consultation_online') or lower(coalesce(new.status,'scheduled')) in ('cancelled','canceled') then return new; end if;
 if new.starts_at is null or new.ends_at is null or new.ends_at<=new.starts_at then raise exception 'Consulta inválida: início e fim obrigatórios'; end if;
 v_start:=new.starts_at at time zone 'America/Sao_Paulo';v_end:=new.ends_at at time zone 'America/Sao_Paulo';
 if extract(isodow from v_start)>5 or v_start::time<time '08:00' or v_end::time>time '18:00' or v_end::date<>v_start::date then raise exception 'Atendimentos permitidos de segunda a sexta, das 8h às 18h (Brasília)'; end if;
 select id into v_expected from public.profiles where org_id=new.org_id and status='active' and lower(email)=case when v_start::time<time '14:00' then 'glauciaadv15@gmail.com' else 'eulampiosuzanne@gmail.com' end limit 1;
 if v_expected is null or new.responsible_id is distinct from v_expected then raise exception 'Profissional incompatível com o horário escolhido'; end if;
 perform pg_advisory_xact_lock(hashtext(new.org_id::text||':consultation_calendar'));
 if exists(select 1 from public.calendar_events e where e.org_id=new.org_id and e.id<>new.id and lower(coalesce(e.status,'scheduled')) not in ('cancelled','canceled','completed') and e.starts_at<new.ends_at and coalesce(e.ends_at,e.starts_at+interval '30 minutes')>new.starts_at) then raise exception 'Horário indisponível: existe compromisso neste intervalo.'; end if;
 return new;
end $$;

create or replace function public.enqueue_appointment_owner_alert()
returns trigger language plpgsql set search_path='public' as $$
declare r record; cname text; msg text; src text;
begin
 if lower(coalesce(new.event_type,'')) in ('consultation','consultation_online','client_consultation') and new.meeting_url is not null and btrim(new.meeting_url)<>'' and (tg_op='INSERT' or old.meeting_url is distinct from new.meeting_url) then
  select name into cname from public.clients where id=new.client_id and org_id=new.org_id;
  msg:='LEXOFFICE • NOVO AGENDAMENTO'||E'\nCliente: '||coalesce(cname,'Não identificado')||E'\nProfissional: '||coalesce((select name from public.profiles where id=new.responsible_id),'Equipe LEX')||E'\nData/Hora: '||to_char(new.starts_at at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')||E'\nAbra na LEX: https://lexoffice.univittagroup.com.br/agenda';
  for r in select distinct regexp_replace(x.phone,'\D','','g') phone from (select alert_phone phone from public.whatsapp_settings where org_id=new.org_id and alerts_enabled=true union all select commercial_alert_phone from public.whatsapp_settings where org_id=new.org_id and alerts_enabled=true) x where nullif(regexp_replace(x.phone,'\D','','g'),'') is not null loop
   src:='appointment_staff_alert:'||new.id::text||':'||r.phone;
   if not exists(select 1 from public.notification_queue q where q.payload->>'source'=src) then insert into public.notification_queue(org_id,client_id,channel,destination,message,payload,scheduled_at,status,owner_user_id,send_to_client_app) values(new.org_id,new.client_id,'whatsapp',r.phone,msg,jsonb_build_object('source',src,'event_id',new.id),now(),'pending',coalesce(new.owner_user_id,new.responsible_id),false); end if;
  end loop;
 end if;
 return new;
end $$;

create or replace function public.notify_owner_glaucia_client_inbox()
returns trigger language plpgsql security definer set search_path='public' as $$
declare r record; v_client text; v_msg text; v_src text; v_owner uuid;
begin
 if new.org_id <> 'b3dd3ed0-2a05-4087-8220-307a44352cec'::uuid then return new; end if;
 select name into v_client from public.clients where id=new.client_id and org_id=new.org_id limit 1;
 select id into v_owner from public.profiles where org_id=new.org_id and lower(email)='eulampiosuzanne@gmail.com' limit 1;
 insert into public.notifications(org_id,user_id,type,title,body,link,read)
 select new.org_id,p.id,'service','Nova ação no aplicativo',coalesce(v_client,'Cliente')||' | '||coalesce(nullif(new.subject,''),new.kind,'Solicitação'),'/app-cliente',false from public.profiles p where p.org_id=new.org_id and lower(p.email)='glauciaadv15@gmail.com';
 v_msg:='LEXOFFICE • NOVA AÇÃO NO APLICATIVO'||E'\nCliente: '||coalesce(v_client,'Cliente')||E'\nAção: '||coalesce(nullif(new.subject,''),new.kind,'Solicitação')||E'\nAbra na LEX: https://lexoffice.univittagroup.com.br/app-cliente';
 for r in select distinct regexp_replace(x.phone,'\D','','g') phone from (select alert_phone phone from public.whatsapp_settings where org_id=new.org_id and alerts_enabled=true union all select commercial_alert_phone from public.whatsapp_settings where org_id=new.org_id and alerts_enabled=true) x where nullif(regexp_replace(x.phone,'\D','','g'),'') is not null loop
  v_src:='client_app_staff_alert:'||new.id::text||':'||r.phone;
  if not exists(select 1 from public.notification_queue q where q.payload->>'source'=v_src) then insert into public.notification_queue(org_id,client_id,channel,destination,message,payload,scheduled_at,status,owner_user_id,send_to_client_app) values(new.org_id,new.client_id,'whatsapp',r.phone,v_msg,jsonb_build_object('source',v_src,'inbox_id',new.id,'kind',new.kind),now(),'pending',coalesce(v_owner,new.created_by),false); end if;
 end loop;
 return new;
end $$;

update public.whatsapp_settings set agenda_enabled=true,agenda_start_time='08:00',agenda_end_time='18:00',agenda_slot_minutes=30,updated_at=now() where org_id='b3dd3ed0-2a05-4087-8220-307a44352cec'::uuid;
