-- App do cliente: andamentos, reuniões, consultas e audiências viram recados no app
-- (client_office_messages) + push no celular. Não depende de send_to_client_app
-- (que sai sempre false nas filas de WhatsApp).

alter table public.client_office_messages
  add column if not exists push_status text not null default 'pending',
  add column if not exists push_sent_at timestamptz,
  add column if not exists push_error text,
  add column if not exists push_attempts int not null default 0;

create index if not exists idx_client_office_messages_push_pending
  on public.client_office_messages (sent_at) where push_status = 'pending';

create or replace function public.lexoffice_client_app_enabled(p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_client is not null and exists(
    select 1 from public.client_app_accounts a where a.client_id = p_client and a.enabled = true)
$$;

create or replace function public.lexoffice_app_when(ts timestamptz)
returns text language sql stable as $$
  select to_char(ts at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI')
$$;

-- Ponto único de publicação no app. Idempotente por (source_table, source_id, client_id).
create or replace function public.lexoffice_client_app_publish(
  p_org uuid, p_client uuid, p_title text, p_body text, p_category text,
  p_priority text, p_requires_ack boolean, p_source_table text, p_source_id uuid,
  p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_org is null or p_client is null or coalesce(btrim(p_body), '') = '' then return null; end if;
  if not public.lexoffice_client_app_enabled(p_client) then return null; end if;
  -- cliente com restrição ativa: o app só trata do débito
  if coalesce(p_category, '') <> 'financeiro' and exists(
       select 1 from public.client_service_restrictions r where r.client_id = p_client and r.active = true) then
    return null;
  end if;
  insert into public.client_office_messages(org_id, client_id, title, body, category, priority, requires_ack,
         sent_at, source_channel, source_table, source_id, metadata, push_status)
  values (p_org, p_client, left(coalesce(nullif(btrim(p_title), ''), 'Aviso do escritório'), 140), left(p_body, 2000),
          coalesce(p_category, 'informativo'), coalesce(p_priority, 'normal'), coalesce(p_requires_ack, false),
          now(), 'app', p_source_table, p_source_id, coalesce(p_metadata, '{}'::jsonb), 'pending')
  on conflict (source_table, source_id, client_id) where source_table is not null and source_id is not null
  do update set title = excluded.title, body = excluded.body,
                metadata = public.client_office_messages.metadata || excluded.metadata,
                read_at = null
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.lexoffice_client_app_publish(uuid,uuid,text,text,text,text,boolean,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.lexoffice_client_app_enabled(uuid) from public, anon;

-- ------------------------------------------------------------------ andamentos
create or replace function public.lexoffice_movement_is_important(p_text text)
returns boolean language sql immutable as $$
  select lower(coalesce(p_text, '')) ~ '(senten[cç]a|liminar|tutela|ac[oó]rd[aã]o|decis[aã]o|julgo|julgad|audi[eê]ncia)'
     and lower(coalesce(p_text, '')) !~ 'conclus'
$$;

create or replace function public.lexoffice_movement_to_client_app()
returns trigger language plpgsql security definer set search_path = public as $$
declare p record; v_day date; v_n int; v_list text; v_body text;
begin
  if coalesce(new.approved_for_client, false) = false or coalesce(new.is_sensitive, false) then return null; end if;
  if tg_op = 'UPDATE' and coalesce(old.approved_for_client, false) = true
     and old.client_message is not distinct from new.client_message then return null; end if;
  -- importação de histórico antigo não gera aviso
  if new.movement_date is not null and new.movement_date < now() - interval '15 days' then return null; end if;
  select pr.id, pr.org_id, pr.client_id, pr.cnj_number, pr.is_confidential into p
    from public.processes pr where pr.id = new.process_id;
  if p.client_id is null or coalesce(p.is_confidential, false) then return null; end if;
  if not public.lexoffice_client_app_enabled(p.client_id) then return null; end if;

  if public.lexoffice_movement_is_important(coalesce(new.title, '') || ' ' || coalesce(new.description, '')) then
    perform public.lexoffice_client_app_publish(p.org_id, p.client_id, 'Novidade importante no seu processo',
      'Houve uma movimentação importante no seu processo' || coalesce(' ' || p.cnj_number, '') || ': '
        || coalesce(nullif(btrim(new.title), ''), 'atualização processual') || '.' || E'\n\n'
        || 'A Dra. Suzanne vai entrar em contato para explicar o que isso significa para você.',
      'processo', 'high', false, 'process_movements', new.id,
      jsonb_build_object('process_id', p.id, 'movement_id', new.id, 'kind', 'movement_important'));
    return null;
  end if;

  -- andamentos comuns: um único aviso por processo por dia
  v_day := (now() at time zone 'America/Sao_Paulo')::date;
  select count(*), string_agg('• ' || left(coalesce(nullif(btrim(m.client_message), ''), nullif(btrim(m.title), ''), 'Atualização processual'), 220), E'\n' order by m.movement_date desc nulls last)
    into v_n, v_list
    from (select * from public.process_movements m
           where m.process_id = p.id and m.approved_for_client and not coalesce(m.is_sensitive, false)
             and (m.created_at at time zone 'America/Sao_Paulo')::date = v_day
             and (m.movement_date is null or m.movement_date >= now() - interval '15 days')
             and not public.lexoffice_movement_is_important(coalesce(m.title, '') || ' ' || coalesce(m.description, ''))
           order by m.movement_date desc nulls last limit 5) m;
  if coalesce(v_n, 0) = 0 then return null; end if;
  v_body := case when v_n = 1 then 'Seu processo' || coalesce(' ' || p.cnj_number, '') || ' teve uma nova movimentação:'
                 else 'Seu processo' || coalesce(' ' || p.cnj_number, '') || ' teve novas movimentações hoje:' end
            || E'\n' || v_list || E'\n\n' || 'Você não precisa fazer nada agora. O escritório está acompanhando e avisa se precisar de você.';
  perform public.lexoffice_client_app_publish(p.org_id, p.client_id, 'Atualização do seu processo', v_body,
    'processo', 'normal', false, 'process_movements:digest', md5('mov-digest:' || p.id || ':' || v_day)::uuid,
    jsonb_build_object('process_id', p.id, 'kind', 'movement_digest', 'day', v_day));
  return null;
end $$;

create or replace trigger trg_movement_to_client_app
  after insert or update of approved_for_client, client_message on public.process_movements
  for each row execute function public.lexoffice_movement_to_client_app();

-- ------------------------------------------------- reuniões, consultas, audiências
create or replace function public.lexoffice_client_app_event_notice(
  p_op text, p_org uuid, p_client uuid, p_process uuid, p_event_id uuid, p_event_type text,
  p_starts timestamptz, p_old_starts timestamptz, p_location text, p_url text,
  p_old_location text, p_old_url text, p_cancelled boolean, p_source text)
returns void language plpgsql security definer set search_path = public as $$
declare v_label text; v_masc boolean; v_hear boolean; v_place text; v_hint text; v_suffix text;
begin
  if p_client is null or p_starts is null or p_starts < now() then return; end if;
  if coalesce(p_event_type, '') in ('deadline', 'task', 'reminder') then return; end if;
  if not public.lexoffice_client_app_enabled(p_client) then return; end if;
  v_hear := p_event_type = 'hearing';
  v_label := case when v_hear then 'Audiência' when p_event_type = 'meeting' then 'Reunião'
                  when p_event_type in ('consultation', 'consultation_online', 'client_consultation') then 'Consulta'
                  else 'Compromisso' end;
  v_masc := v_label = 'Compromisso';
  v_suffix := case when v_masc then 'o' else 'a' end;
  v_place := case when nullif(btrim(p_url), '') is not null then E'\n' || 'Link para entrar: ' || p_url
                  when nullif(btrim(p_location), '') is not null then E'\n' || 'Local: ' || p_location else '' end;
  v_hint := case when v_hear then E'\n\n' || 'Leve documento com foto e chegue com 30 minutos de antecedência. Se for online, entre no link alguns minutos antes.' else '' end;

  if p_cancelled then
    perform public.lexoffice_client_app_publish(p_org, p_client, v_label || ' cancelad' || v_suffix,
      case when v_masc then 'O ' else 'A ' end || lower(v_label) || ' marcad' || v_suffix || ' para ' || public.lexoffice_app_when(p_starts)
        || ' foi cancelad' || v_suffix || '.' || E'\n\n' || 'Se for preciso marcar nova data, o escritório vai avisar você.',
      'audiencia', case when v_hear then 'high' else 'normal' end, false,
      p_source || ':cancel', md5(p_source || ':cancel:' || p_event_id || ':' || p_starts)::uuid,
      jsonb_build_object('event_id', p_event_id, 'process_id', p_process, 'kind', 'event_cancelled'));
  elsif p_op = 'INSERT' then
    perform public.lexoffice_client_app_publish(p_org, p_client, v_label || ' marcad' || v_suffix,
      case when v_masc then 'Seu ' else 'Sua ' end || lower(v_label) || ' foi marcad' || v_suffix || ' para '
        || public.lexoffice_app_when(p_starts) || '.' || v_place || v_hint,
      'audiencia', case when v_hear then 'high' else 'normal' end, v_hear,
      p_source, p_event_id,
      jsonb_build_object('event_id', p_event_id, 'process_id', p_process, 'kind', 'event_created', 'starts_at', p_starts));
  elsif p_old_starts is distinct from p_starts then
    perform public.lexoffice_client_app_publish(p_org, p_client, v_label || ' remarcad' || v_suffix,
      case when v_masc then 'Seu ' else 'Sua ' end || lower(v_label) || ' mudou de data. Nova data: '
        || public.lexoffice_app_when(p_starts) || '.' || v_place || v_hint,
      'audiencia', case when v_hear then 'high' else 'normal' end, v_hear,
      p_source || ':reschedule', md5(p_source || ':reschedule:' || p_event_id || ':' || p_starts)::uuid,
      jsonb_build_object('event_id', p_event_id, 'process_id', p_process, 'kind', 'event_rescheduled', 'starts_at', p_starts));
  elsif p_old_url is distinct from p_url or p_old_location is distinct from p_location then
    if v_place = '' then return; end if;
    perform public.lexoffice_client_app_publish(p_org, p_client, 'Atualização d' || v_suffix || ' ' || lower(v_label),
      case when v_masc then 'Seu ' else 'Sua ' end || lower(v_label) || ' de ' || public.lexoffice_app_when(p_starts)
        || ' teve o local ou o link atualizado.' || v_place,
      'audiencia', 'normal', false,
      p_source || ':place', md5(p_source || ':place:' || p_event_id || ':' || coalesce(p_url, '') || ':' || coalesce(p_location, ''))::uuid,
      jsonb_build_object('event_id', p_event_id, 'process_id', p_process, 'kind', 'event_place_changed'));
  end if;
end $$;

revoke all on function public.lexoffice_client_app_event_notice(text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,text,text,text,boolean,text) from public, anon, authenticated;

create or replace function public.lexoffice_calendar_event_to_client_app()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_cancel boolean;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  v_cancel := tg_op = 'DELETE'
    or (tg_op = 'UPDATE' and lower(coalesce(new.status, '')) in ('cancelled', 'canceled')
        and lower(coalesce(old.status, '')) not in ('cancelled', 'canceled'));
  if tg_op <> 'DELETE' and not v_cancel and lower(coalesce(r.status, '')) in ('cancelled', 'canceled') then return null; end if;
  perform public.lexoffice_client_app_event_notice(
    tg_op, r.org_id, r.client_id, r.process_id, r.id, r.event_type, r.starts_at,
    case when tg_op = 'UPDATE' then old.starts_at end, r.location, r.meeting_url,
    case when tg_op = 'UPDATE' then old.location end, case when tg_op = 'UPDATE' then old.meeting_url end,
    v_cancel, 'calendar_events');
  return null;
end $$;

create or replace trigger trg_calendar_event_to_client_app
  after insert or update of starts_at, status, location, meeting_url or delete on public.calendar_events
  for each row execute function public.lexoffice_calendar_event_to_client_app();

-- audiências cadastradas direto no processo (sem evento de agenda vinculado)
create or replace function public.lexoffice_process_hearing_to_client_app()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_client uuid; v_cancel boolean;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  if r.source_calendar_event_id is not null then return null; end if; -- já avisado pela agenda
  v_client := coalesce(r.client_id, (select client_id from public.processes where id = r.process_id));
  if exists(select 1 from public.processes where id = r.process_id and coalesce(is_confidential, false)) then return null; end if;
  v_cancel := tg_op = 'DELETE'
    or (tg_op = 'UPDATE' and lower(coalesce(new.status, '')) in ('cancelled', 'canceled')
        and lower(coalesce(old.status, '')) not in ('cancelled', 'canceled'));
  if tg_op <> 'DELETE' and not v_cancel and lower(coalesce(r.status, '')) in ('cancelled', 'canceled') then return null; end if;
  perform public.lexoffice_client_app_event_notice(
    tg_op, r.org_id, v_client, r.process_id, r.id, 'hearing', r.starts_at,
    case when tg_op = 'UPDATE' then old.starts_at end, r.location, r.meeting_url,
    case when tg_op = 'UPDATE' then old.location end, case when tg_op = 'UPDATE' then old.meeting_url end,
    v_cancel, 'process_hearings');
  return null;
end $$;

create or replace trigger trg_process_hearing_to_client_app
  after insert or update of starts_at, status, location, meeting_url or delete on public.process_hearings
  for each row execute function public.lexoffice_process_hearing_to_client_app();

-- ------------------------------------------------------------ lembretes no app
create or replace function public.lexoffice_client_app_event_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare e record; n int := 0; v_label text; v_suffix text; v_id uuid;
begin
  for e in
    select ce.id, ce.org_id, ce.client_id, ce.process_id, ce.event_type, ce.starts_at, ce.location, ce.meeting_url, ce.created_at, 'calendar_events' src
      from public.calendar_events ce
     where ce.client_id is not null and coalesce(ce.event_type, '') not in ('deadline', 'task', 'reminder')
       and lower(coalesce(ce.status, '')) not in ('cancelled', 'canceled')
       and ce.starts_at between now() + interval '2 hours' and now() + interval '7 days 6 hours'
    union all
    select h.id, h.org_id, coalesce(h.client_id, pr.client_id), h.process_id, 'hearing', h.starts_at, h.location, h.meeting_url, h.created_at, 'process_hearings'
      from public.process_hearings h join public.processes pr on pr.id = h.process_id
     where h.source_calendar_event_id is null and not coalesce(pr.is_confidential, false)
       and lower(coalesce(h.status, '')) not in ('cancelled', 'canceled')
       and h.starts_at between now() + interval '2 hours' and now() + interval '7 days 6 hours'
  loop
    if e.client_id is null or not public.lexoffice_client_app_enabled(e.client_id) then continue; end if;
    v_label := case when e.event_type = 'hearing' then 'audiência' when e.event_type = 'meeting' then 'reunião'
                    when e.event_type in ('consultation', 'consultation_online', 'client_consultation') then 'consulta' else 'compromisso' end;
    v_suffix := case when v_label = 'compromisso' then 'Seu ' else 'Sua ' end;
    -- véspera (até 30h antes), só se o evento não acabou de ser criado
    if e.starts_at <= now() + interval '30 hours' and e.created_at < now() - interval '2 hours' then
      v_id := public.lexoffice_client_app_publish(e.org_id, e.client_id, 'Lembrete: ' || v_label || ' em breve',
        v_suffix || v_label || ' está marcad' || case when v_label = 'compromisso' then 'o' else 'a' end || ' para '
          || public.lexoffice_app_when(e.starts_at) || '.'
          || case when nullif(btrim(e.meeting_url), '') is not null then E'\n' || 'Link para entrar: ' || e.meeting_url
                  when nullif(btrim(e.location), '') is not null then E'\n' || 'Local: ' || e.location else '' end
          || case when e.event_type = 'hearing' then E'\n\n' || 'Leve documento com foto e chegue com 30 minutos de antecedência.' else '' end,
        'audiencia', 'high', false, e.src || ':d1', md5(e.src || ':d1:' || e.id || ':' || e.starts_at)::uuid,
        jsonb_build_object('event_id', e.id, 'process_id', e.process_id, 'kind', 'event_reminder_d1'));
      if v_id is not null then n := n + 1; end if;
    -- audiência: também 7 dias antes
    elsif e.event_type = 'hearing' and e.starts_at between now() + interval '6 days' and now() + interval '7 days 6 hours'
          and e.created_at < now() - interval '2 hours' then
      v_id := public.lexoffice_client_app_publish(e.org_id, e.client_id, 'Lembrete: audiência na próxima semana',
        'Sua audiência está marcada para ' || public.lexoffice_app_when(e.starts_at) || '.'
          || case when nullif(btrim(e.meeting_url), '') is not null then E'\n' || 'Link para entrar: ' || e.meeting_url
                  when nullif(btrim(e.location), '') is not null then E'\n' || 'Local: ' || e.location else '' end,
        'audiencia', 'normal', false, e.src || ':d7', md5(e.src || ':d7:' || e.id || ':' || e.starts_at)::uuid,
        jsonb_build_object('event_id', e.id, 'process_id', e.process_id, 'kind', 'event_reminder_d7'));
      if v_id is not null then n := n + 1; end if;
    end if;
  end loop;
  return n;
end $$;

revoke all on function public.lexoffice_client_app_event_reminders() from public, anon, authenticated;

-- agenda do app também mostra audiências cadastradas direto no processo
create or replace function public.client_app_calendar()
 returns table(id uuid, title text, description text, event_type text, starts_at timestamptz, ends_at timestamptz,
               location text, meeting_mode text, meeting_url text, status text)
 language sql security definer set search_path to 'public' as $function$
 select e.id,
   case when e.event_type='deadline' then 'Prazo no seu processo'
        else regexp_replace(e.title,'^\[PRAZO\]\s*','') end,
   case when e.event_type='deadline' then 'O escritório está cuidando deste prazo. Você só precisa agir se entrarmos em contato.'
        when e.event_type='hearing' then 'Leve documento com foto e chegue com 30 minutos de antecedência. Em caso de audiência online, entre no link alguns minutos antes.'
        else null end,
   case e.event_type when 'hearing' then 'Audiência' when 'deadline' then 'Prazo' when 'meeting' then 'Reunião'
        when 'appointment' then 'Compromisso' when 'consultation' then 'Consulta' when 'consultation_online' then 'Consulta online'
        when 'client_consultation' then 'Consulta' when 'task' then 'Tarefa' when 'reminder' then 'Lembrete' else 'Compromisso' end,
   e.starts_at, e.ends_at,
   case when e.event_type='deadline' then null else e.location end,
   e.meeting_mode, e.meeting_url, e.status
 from public.calendar_events e
 where exists(select 1 from public.client_app_accounts a where a.client_id=e.client_id and a.user_id=auth.uid() and a.enabled=true)
 and coalesce(e.status,'') not in ('cancelled','canceled')
 union all
 select h.id, coalesce(nullif(h.title,''),'Audiência'),
   'Leve documento com foto e chegue com 30 minutos de antecedência. Em caso de audiência online, entre no link alguns minutos antes.',
   'Audiência', h.starts_at, null::timestamptz, h.location, null::text, h.meeting_url, h.status
 from public.process_hearings h join public.processes p on p.id=h.process_id
 where h.source_calendar_event_id is null and not coalesce(p.is_confidential,false)
   and exists(select 1 from public.client_app_accounts a where a.client_id=coalesce(h.client_id,p.client_id) and a.user_id=auth.uid() and a.enabled=true)
   and coalesce(h.status,'') not in ('cancelled','canceled')
 order by 5 asc;
$function$;
