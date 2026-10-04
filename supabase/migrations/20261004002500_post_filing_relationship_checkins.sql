alter table public.scheduled_client_messages
  add column if not exists process_id uuid references public.processes(id) on delete cascade,
  add column if not exists automation_key text;

create unique index if not exists scheduled_client_messages_post_filing_unique
on public.scheduled_client_messages(process_id, automation_key)
where automation_key in ('post_filing_7d','post_filing_30d');

create or replace function public.queue_post_filing_relationship_checkins()
returns trigger language plpgsql security definer set search_path=public as $$
declare c public.clients%rowtype; phone_digits text; first_name text; base_day date;
begin
  if new.client_id is null or coalesce(trim(new.cnj_number),'')='' then return new; end if;
  select * into c from public.clients where id=new.client_id;
  if not found or coalesce(c.status,'active')<>'active' then return new; end if;
  if exists(select 1 from public.client_service_restrictions r where r.client_id=c.id and r.active=true) then return new; end if;
  phone_digits:=regexp_replace(coalesce(c.whatsapp,c.phone,''),'\D','','g');
  if length(phone_digits)<10 then return new; end if;
  if left(phone_digits,2)<>'55' then phone_digits:='55'||phone_digits; end if;
  first_name:=split_part(trim(c.name),' ',1);
  base_day:=(new.created_at at time zone 'America/Sao_Paulo')::date;
  insert into public.scheduled_client_messages
    (org_id,client_id,process_id,client_name,phone,message,agent_key,scheduled_at,status,send_to_client_app,automation_key)
  values
    (new.org_id,c.id,new.id,c.name,phone_digits,'Olá, '||first_name||'. Passando para saber como você está e se está tudo bem desde o ajuizamento da sua ação. Seguimos acompanhando seu processo por aqui. Se houver alguma situação nova ou algo que considere importante nos informar, pode nos escrever. ⚖️','client_schedule_relationship',((base_day+7)::timestamp + time '10:00') at time zone 'America/Sao_Paulo','pending',true,'post_filing_7d'),
    (new.org_id,c.id,new.id,c.name,phone_digits,'Olá, '||first_name||'. Passando para saber como você está e se está tudo bem. Seguimos acompanhando seu processo e permanecemos à disposição. Se aconteceu algo novo ou houver alguma informação importante para o seu caso, pode nos escrever. ⚖️','client_schedule_relationship',((base_day+30)::timestamp + time '10:00') at time zone 'America/Sao_Paulo','pending',true,'post_filing_30d')
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists trg_queue_post_filing_relationship_checkins on public.processes;
create trigger trg_queue_post_filing_relationship_checkins after insert on public.processes
for each row execute function public.queue_post_filing_relationship_checkins();

create or replace function public.cancel_nearby_relationship_checkins_on_contact()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.client_id is null or new.last_message_at is null then return new; end if;
  update public.scheduled_client_messages set status='cancelled',error_message='Cancelado automaticamente: houve interação recente com o cliente.',updated_at=now()
  where client_id=new.client_id and status='pending' and automation_key in ('post_filing_7d','post_filing_30d')
    and scheduled_at between new.last_message_at and new.last_message_at + interval '3 days';
  return new;
end $$;

drop trigger if exists trg_cancel_relationship_checkins_on_contact on public.whatsapp_conversations;
create trigger trg_cancel_relationship_checkins_on_contact after insert or update of last_message_at on public.whatsapp_conversations
for each row execute function public.cancel_nearby_relationship_checkins_on_contact();

create or replace function public.cancel_relationship_checkins_on_restriction()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.active=true then
    update public.scheduled_client_messages set status='cancelled',error_message='Cancelado automaticamente: cliente com restrição ativa.',updated_at=now()
    where client_id=new.client_id and status='pending' and automation_key in ('post_filing_7d','post_filing_30d');
  end if;
  return new;
end $$;

drop trigger if exists trg_cancel_relationship_checkins_on_restriction on public.client_service_restrictions;
create trigger trg_cancel_relationship_checkins_on_restriction after insert or update of active on public.client_service_restrictions
for each row execute function public.cancel_relationship_checkins_on_restriction();
