-- Contatos atendidos somente pelo chatbot de botões. Apenas acrescenta; não altera dados existentes.
create table if not exists public.chatbot_only_contacts (
  org_id uuid not null,
  contact_key text not null,
  enabled boolean not null default true,
  node text not null default 'new',
  tries int not null default 0,
  version int not null default 0,
  last_inbound_at timestamptz,
  last_message_id uuid,
  previous jsonb,
  updated_at timestamptz not null default now(),
  primary key (org_id, contact_key)
);
alter table public.chatbot_only_contacts enable row level security;
create policy chatbot_only_contacts_select on public.chatbot_only_contacts for select to authenticated using (org_id = public.current_org_id());

create table if not exists public.chatbot_only_secret (id boolean primary key default true check (id), token text not null);
alter table public.chatbot_only_secret enable row level security;
revoke all on public.chatbot_only_secret from anon, authenticated;
insert into public.chatbot_only_secret(id, token) values (true, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')) on conflict do nothing;

create schema if not exists private;

-- Enquanto marcado, ninguém religa a Helena para o contato.
create or replace function private.chatbot_only_guard_controls() returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if exists (select 1 from public.chatbot_only_contacts c where c.org_id = new.org_id and c.contact_key = new.contact_key and c.enabled) then
    new.ai_enabled := false; new.human_takeover := true; new.resume_at := null;
  end if;
  return new;
end $$;

create or replace function private.chatbot_only_guard_conversation() returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if (new.bot_ativo is not false or new.conversation_owner is distinct from 'HUMAN') and exists (
    select 1 from public.whatsapp_contacts w join public.chatbot_only_contacts c
      on c.org_id = w.org_id and c.contact_key = regexp_replace(w.phone, '\D', '', 'g') and c.enabled
    where w.id = new.contact_id and w.org_id = new.org_id) then
    new.bot_ativo := false; new.conversation_owner := 'HUMAN';
  end if;
  return new;
end $$;

create or replace function private.chatbot_only_route() returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_token text;
begin
  if new.direction <> 'inbound' then return new; end if;
  begin
    if exists (
      select 1 from public.whatsapp_conversations v
      join public.whatsapp_contacts w on w.id = v.contact_id
      join public.chatbot_only_contacts c on c.org_id = v.org_id and c.contact_key = regexp_replace(w.phone, '\D', '', 'g') and c.enabled
      where v.id = new.conversation_id and v.org_id = new.org_id) then
      select token into v_token from public.chatbot_only_secret where id;
      perform net.http_post(
        url := 'https://dcpwcuototomxoiszukt.supabase.co/functions/v1/chatbot-botoes',
        body := jsonb_build_object('message_id', new.id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-bot-token', v_token),
        timeout_milliseconds := 5000);
    end if;
  exception when others then raise warning 'chatbot_only_route: %', sqlerrm;
  end;
  return new;
end $$;

create trigger trg_chatbot_only_guard_controls before insert or update on public.ai_conversation_controls for each row execute function private.chatbot_only_guard_controls();
create trigger trg_chatbot_only_guard_conversation before insert or update on public.whatsapp_conversations for each row execute function private.chatbot_only_guard_conversation();
create trigger trg_chatbot_only_route after insert on public.whatsapp_messages for each row execute function private.chatbot_only_route();

-- Botão da Caixa de Entrada.
create or replace function public.set_chatbot_only(p_conversation_id uuid, p_enabled boolean) returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare v record; v_key text; v_prev jsonb;
begin
  select c.org_id, c.owner_user_id, c.bot_ativo, c.conversation_owner, c.contact_id, regexp_replace(w.phone, '\D', '', 'g') as phone into v
    from public.whatsapp_conversations c join public.whatsapp_contacts w on w.id = c.contact_id
   where c.id = p_conversation_id;
  if not found or auth.uid() is null or v.org_id is distinct from public.current_org_id()
     or not (v.owner_user_id = auth.uid() or public.can_access_office_operational_data(v.org_id)) then
    raise exception 'Conversa não encontrada ou sem permissão';
  end if;
  v_key := v.phone;
  if coalesce(v_key, '') = '' then raise exception 'Contato sem telefone'; end if;

  if p_enabled then
    select jsonb_build_object('ai_enabled', a.ai_enabled, 'human_takeover', a.human_takeover) into v_prev
      from public.ai_conversation_controls a where a.org_id = v.org_id and a.contact_key = v_key limit 1;
    insert into public.chatbot_only_contacts as t (org_id, contact_key, previous)
      values (v.org_id, v_key, coalesce(v_prev, '{}'::jsonb) || jsonb_build_object('bot_ativo', v.bot_ativo, 'owner', v.conversation_owner))
      on conflict (org_id, contact_key) do update set enabled = true, node = 'new', tries = 0, last_inbound_at = null,
        previous = case when t.enabled then t.previous else excluded.previous end, updated_at = now();
    update public.ai_conversation_controls set ai_enabled = false, human_takeover = true, resume_at = null, updated_at = now() where org_id = v.org_id and contact_key = v_key;
    if not found then
      insert into public.ai_conversation_controls (org_id, contact_key, ai_enabled, human_takeover, owner_user_id) values (v.org_id, v_key, false, true, v.owner_user_id);
    end if;
    update public.whatsapp_conversations c set bot_ativo = false, conversation_owner = 'HUMAN', updated_at = now()
      from public.whatsapp_contacts w where w.id = c.contact_id and c.org_id = v.org_id and regexp_replace(w.phone, '\D', '', 'g') = v_key;
  else
    update public.chatbot_only_contacts set enabled = false, updated_at = now() where org_id = v.org_id and contact_key = v_key and enabled returning previous into v_prev;
    if not found then return false; end if;
    update public.ai_conversation_controls set ai_enabled = coalesce((v_prev->>'ai_enabled')::boolean, true), human_takeover = coalesce((v_prev->>'human_takeover')::boolean, false), updated_at = now()
      where org_id = v.org_id and contact_key = v_key;
    update public.whatsapp_conversations set bot_ativo = coalesce((v_prev->>'bot_ativo')::boolean, true), conversation_owner = coalesce(v_prev->>'owner', 'HELENA'), updated_at = now()
      where id = p_conversation_id;
  end if;
  return p_enabled;
end $$;
revoke all on function public.set_chatbot_only(uuid, boolean) from public, anon;
grant execute on function public.set_chatbot_only(uuid, boolean) to authenticated;
