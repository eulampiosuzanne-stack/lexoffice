-- Push (Expo) dos recados do app do cliente, feito direto do banco via pg_net
-- (o plano gratuito do Supabase não permite mais Edge Functions neste projeto).

alter table public.client_office_messages
  add column if not exists push_request_id bigint,
  add column if not exists push_token_ids uuid[],
  add column if not exists push_dispatched_at timestamptz;

-- sem push de madrugada: 21h–8h (Brasília) fica na fila e sai às 8h
create or replace function public.lexoffice_app_quiet_hour(ts timestamptz default now())
returns boolean language sql stable as $$
  select extract(hour from ts at time zone 'America/Sao_Paulo') < 8
      or extract(hour from ts at time zone 'America/Sao_Paulo') >= 21
$$;

create or replace function public.lexoffice_client_app_push_body(b text)
returns text language sql immutable as $$
  select case when length(x) > 178 then rtrim(left(x, 175)) || '...' else x end
    from (select btrim(regexp_replace(regexp_replace(coalesce(b, ''), '\s*\n+\s*', ' ', 'g'), '\s{2,}', ' ', 'g')) x) s
$$;

create or replace function public.lexoffice_client_app_push_dispatch(p_message uuid default null)
returns int language plpgsql security definer set search_path = public, net as $$
declare m record; v_tokens uuid[]; v_payload jsonb; v_req bigint; n int := 0;
begin
  if public.lexoffice_app_quiet_hour() then return 0; end if;
  update public.client_office_messages set push_status = 'expired'
   where push_status = 'pending' and sent_at < now() - interval '3 days';
  for m in
    select * from public.client_office_messages
     where push_status = 'pending' and (p_message is null or id = p_message)
       and sent_at >= now() - interval '3 days'
     order by sent_at limit 100
     for update skip locked
  loop
    select array_agg(t.id order by t.id),
           jsonb_agg(jsonb_build_object(
             'to', t.expo_push_token, 'title', coalesce(m.title, 'Aviso do escritório'),
             'body', public.lexoffice_client_app_push_body(m.body), 'sound', 'default', 'channelId', 'default',
             'priority', case when m.priority = 'high' then 'high' else 'default' end,
             'data', jsonb_build_object('message_id', m.id, 'screen', 'Recados', 'category', m.category)) order by t.id)
      into v_tokens, v_payload
      from public.client_push_tokens t where t.client_id = m.client_id and t.enabled = true;
    if v_tokens is null then
      update public.client_office_messages set push_status = 'no_device' where id = m.id;
      continue;
    end if;
    v_req := net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := v_payload,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
      timeout_milliseconds := 15000);
    update public.client_office_messages
       set push_status = 'sending', push_request_id = v_req, push_token_ids = v_tokens,
           push_attempts = push_attempts + 1, push_dispatched_at = now()
     where id = m.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.lexoffice_client_app_push_reconcile()
returns int language plpgsql security definer set search_path = public, net as $$
declare m record; v_json jsonb; v_ok boolean; v_err text; t jsonb; i int; n int := 0;
begin
  for m in
    select c.id, c.push_token_ids, c.push_attempts, r.status_code, r.content, r.error_msg, r.timed_out
      from public.client_office_messages c
      join net._http_response r on r.id = c.push_request_id
     where c.push_status = 'sending'
  loop
    v_ok := false; v_err := null; v_json := null;
    if m.status_code = 200 then
      begin v_json := m.content::jsonb; exception when others then v_json := null; end;
      if jsonb_typeof(v_json -> 'data') = 'array' then
        for i in 0 .. jsonb_array_length(v_json -> 'data') - 1 loop
          t := v_json -> 'data' -> i;
          if t ->> 'status' = 'ok' then v_ok := true;
          else
            v_err := left(coalesce(t #>> '{details,error}', t ->> 'message', 'expo_error'), 300);
            if t #>> '{details,error}' = 'DeviceNotRegistered' and m.push_token_ids[i + 1] is not null then
              update public.client_push_tokens set enabled = false, updated_at = now() where id = m.push_token_ids[i + 1];
            end if;
          end if;
        end loop;
      else
        v_err := 'expo_resposta_invalida:' || left(coalesce(m.content, ''), 200);
      end if;
    else
      v_err := 'http_' || coalesce(m.status_code::text, '?') || ':' || left(coalesce(m.error_msg, m.content, case when m.timed_out then 'timeout' end, ''), 250);
    end if;
    update public.client_office_messages
       set push_status = case when v_ok then 'sent' when m.push_attempts >= 3 then 'failed' else 'pending' end,
           push_sent_at = case when v_ok then now() else push_sent_at end,
           push_error = case when v_ok then null else v_err end
     where id = m.id;
    n := n + 1;
  end loop;
  -- resposta sumiu (pg_net limpa após algumas horas) ou nunca veio
  update public.client_office_messages
     set push_status = case when push_attempts >= 3 then 'failed' else 'pending' end,
         push_error = 'sem_resposta_do_expo'
   where push_status = 'sending' and push_dispatched_at < now() - interval '30 minutes'
     and not exists (select 1 from net._http_response r where r.id = push_request_id);
  return n;
end $$;

revoke all on function public.lexoffice_client_app_push_dispatch(uuid) from public, anon, authenticated;
revoke all on function public.lexoffice_client_app_push_reconcile() from public, anon, authenticated;

-- recado novo: tenta mandar o push na hora
create or replace function public.lexoffice_client_office_message_push()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.push_status = 'pending' then
    perform public.lexoffice_client_app_push_dispatch(new.id);
  end if;
  return null;
end $$;

create or replace trigger trg_client_office_message_push
  after insert on public.client_office_messages
  for each row execute function public.lexoffice_client_office_message_push();

-- fila: confere respostas e reenvia a cada 5 min; lembretes 8h–20h (Brasília)
select cron.schedule('lexoffice-client-app-push', '*/5 * * * *',
  'select public.lexoffice_client_app_push_reconcile(); select public.lexoffice_client_app_push_dispatch();');
select cron.schedule('lexoffice-client-app-event-reminders', '*/30 11-23 * * *',
  'select public.lexoffice_client_app_event_reminders();');
