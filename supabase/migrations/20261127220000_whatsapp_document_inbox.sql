-- Arquivo enviado pelo cliente no WhatsApp espera ele marcar qual documento do pedido é.
create table if not exists public.whatsapp_document_inbox (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  source_message_id text not null unique,
  document_id uuid references public.documents(id) on delete set null,
  storage_path text not null,
  filename text not null,
  mime text,
  size_bytes bigint,
  status text not null default 'waiting' check (status in ('waiting','processing','linked','other')),
  request_id uuid references public.client_document_requests(id) on delete set null,
  options jsonb,
  list_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_document_inbox_conv on public.whatsapp_document_inbox (conversation_id, status);
alter table public.whatsapp_document_inbox enable row level security;
create policy whatsapp_document_inbox_select on public.whatsapp_document_inbox for select to authenticated using (org_id = public.current_org_id());

-- Uma lista por leva de arquivos (fotos enviadas juntas não geram várias listas).
create or replace function public.lex_claim_document_list(p_inbox uuid, p_options jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_conv uuid;
begin
  select conversation_id into v_conv from whatsapp_document_inbox where id = p_inbox;
  if v_conv is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('docinbox:' || v_conv::text, 0));
  if exists (select 1 from whatsapp_document_inbox where conversation_id = v_conv and status = 'waiting' and list_sent_at > now() - interval '2 minutes') then return false; end if;
  update whatsapp_document_inbox set list_sent_at = now(), options = p_options where id = p_inbox;
  return true;
end $$;

-- Cliente pelo telefone (só quando há exatamente um).
create or replace function public.lex_client_by_phone(p_org uuid, p_phone text)
returns uuid language sql stable security definer set search_path = public as $$
  with k as (select regexp_replace(p_phone, '\D', '', 'g') d),
  n as (select case when length(d) >= 12 and left(d, 2) = '55' then substr(d, 3) else d end d from k),
  m as (
    select c.id from clients c, n, lateral (values (c.whatsapp), (c.phone)) v(raw),
      lateral (select regexp_replace(coalesce(v.raw, ''), '\D', '', 'g') x) a,
      lateral (select case when length(a.x) >= 12 and left(a.x, 2) = '55' then substr(a.x, 3) else a.x end y) b
    where c.org_id = p_org and length(b.y) >= 10 and length(n.d) >= 10 and left(b.y, 2) = left(n.d, 2) and right(b.y, 8) = right(n.d, 8)
    group by c.id)
  select (array_agg(id))[1] from m having count(*) = 1
$$;

-- A mensagem é a escolha de um documento? (toque na lista ou número, com arquivo esperando)
create or replace function public.lex_is_document_choice(p_conversation uuid, p_body text, p_row text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_row, '') like 'docreq:%' or (
    coalesce(p_row, '') = '' and coalesce(p_body, '') ~ '^\s*\d{1,2}\s*$'
    and exists (select 1 from whatsapp_document_inbox where conversation_id = p_conversation and status = 'waiting' and list_sent_at > now() - interval '30 minutes'))
$$;
revoke all on function public.lex_claim_document_list(uuid, jsonb), public.lex_client_by_phone(uuid, text), public.lex_is_document_choice(uuid, text, text) from public, anon, authenticated;
grant execute on function public.lex_claim_document_list(uuid, jsonb), public.lex_client_by_phone(uuid, text), public.lex_is_document_choice(uuid, text, text) to service_role;

create or replace function private.document_choice_route()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_token text;
begin
  if new.direction <> 'inbound' then return new; end if;
  begin
    if public.lex_is_document_choice(new.conversation_id, new.body, new.metadata->>'selected_row_id') then
      select token into v_token from public.chatbot_only_secret where id;
      perform net.http_post(url := 'https://dcpwcuototomxoiszukt.supabase.co/functions/v1/whatsapp-media-intake',
        body := jsonb_build_object('action', 'choose', 'message_id', new.id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-bot-token', v_token),
        timeout_milliseconds := 30000);
    end if;
  exception when others then raise warning 'document_choice_route: %', sqlerrm;
  end;
  return new;
end $$;
create trigger trg_document_choice_route after insert on public.whatsapp_messages for each row execute function private.document_choice_route();

-- A escolha do documento não vai para a Helena (quem responde é o pedido de documentos).
create or replace function public.claim_waha_active_reply(p_org uuid, p_conversation uuid, p_event text)
returns text language plpgsql set search_path to '' as $function$
declare
  conversation public.whatsapp_conversations%rowtype;
begin
  if p_event is null or length(p_event) not between 1 and 512 then return 'invalid_event'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text || ':' || p_conversation::text, 0));
  if exists(select 1 from public.whatsapp_messages w where w.conversation_id = p_conversation and w.external_message_id = p_event
    and w.direction = 'inbound' and public.lex_is_document_choice(p_conversation, w.body, w.metadata->>'selected_row_id')) then return 'document_choice'; end if;
  select * into conversation from public.whatsapp_conversations
    where org_id = p_org and id = p_conversation;
  if not found or conversation.bot_ativo is false or conversation.conversation_owner = 'HUMAN'
    or conversation.last_human_outbound_at > now() - interval '20 minutes'
    or conversation.human_takeover_reason = 'watchdog_loop' then return 'human_or_watchdog'; end if;
  if exists(select 1 from public.waha_active_reply_claims
    where org_id=p_org and conversation_id=p_conversation and event_id=p_event) then return 'duplicate'; end if;
  if exists(select 1 from public.waha_active_reply_claims
    where org_id=p_org and conversation_id=p_conversation and in_progress
      and claimed_at > now()-interval '3 minutes') then return 'reply_in_progress'; end if;
  insert into public.waha_active_reply_claims(org_id,conversation_id,event_id,in_progress)
    values(p_org,p_conversation,p_event,true);
  return 'claimed';
end $function$;
