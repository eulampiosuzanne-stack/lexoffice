alter table public.clients
  add column if not exists is_vip boolean not null default false;

create table if not exists public.vip_internal_secrets (
  id boolean primary key default true check (id),
  token text not null,
  created_at timestamptz not null default now()
);
alter table public.vip_internal_secrets enable row level security;
revoke all on public.vip_internal_secrets from anon, authenticated;
grant select on public.vip_internal_secrets to service_role;
insert into public.vip_internal_secrets (id, token)
values (true, gen_random_uuid()::text)
on conflict (id) do nothing;

create table if not exists public.vip_greeting_deliveries (
  conversation_id uuid primary key references public.whatsapp_conversations(id) on delete cascade,
  org_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text
);
alter table public.vip_greeting_deliveries enable row level security;
revoke all on public.vip_greeting_deliveries from anon, authenticated;
grant select, insert, update on public.vip_greeting_deliveries to service_role;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.route_vip_inbound_message()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_client_id uuid;
  v_client_name text;
  v_phone text;
  v_dra_id uuid;
  v_token text;
begin
  if new.direction <> 'inbound' then return new; end if;
  select coalesce(c.client_id, wc.client_id), cl.name, wc.phone
    into v_client_id, v_client_name, v_phone
  from public.whatsapp_conversations c
  left join public.whatsapp_contacts wc on wc.id = c.contact_id
  left join public.clients cl on cl.id = coalesce(c.client_id, wc.client_id)
  where c.id = new.conversation_id and c.org_id = new.org_id
  limit 1;
  if v_client_id is null or not exists (
    select 1 from public.clients cl
    where cl.id = v_client_id and cl.org_id = new.org_id and cl.is_vip = true
  ) then return new; end if;

  update public.whatsapp_conversations
  set priority = 'urgent', bot_ativo = false, conversation_owner = 'HUMAN',
      human_takeover_at = coalesce(human_takeover_at, now()),
      human_takeover_reason = 'vip_auto_handoff', updated_at = now()
  where id = new.conversation_id and org_id = new.org_id;

  if nullif(trim(v_phone), '') is not null then
    update public.ai_conversation_controls
    set ai_enabled = false, human_takeover = true,
        human_takeover_at = coalesce(human_takeover_at, now()), updated_at = now()
    where org_id = new.org_id and contact_key = v_phone;
    if not found then
      insert into public.ai_conversation_controls
        (org_id, contact_key, ai_enabled, human_takeover, human_takeover_at, updated_at)
      values (new.org_id, v_phone, false, true, now(), now());
    end if;
  end if;

  select p.id into v_dra_id
  from public.profiles p
  where p.org_id = new.org_id and p.role_key = 'owner'
    and lower(p.name) like '%suzanne%'
  order by p.created_at asc limit 1;
  if v_dra_id is not null then
    insert into public.notifications(org_id,user_id,type,title,body,link,read)
    values (new.org_id, v_dra_id, 'service', 'Mensagem de cliente VIP',
      coalesce(v_client_name,'Cliente VIP') || ' enviou uma mensagem no WhatsApp. A conversa foi priorizada.',
      '/whatsapp', false);
  end if;

  select token into v_token from public.vip_internal_secrets where id = true;
  if v_token is not null then
    begin
      perform net.http_post(
        url := 'https://dcpwcuototomxoiszukt.supabase.co/functions/v1/whatsapp-send-message',
        body := jsonb_build_object('action','vip_inbound','message_id',new.id),
        headers := jsonb_build_object('Content-Type','application/json','x-vip-token',v_token),
        timeout_milliseconds := 2000
      );
    exception when others then null;
    end;
  end if;
  return new;
end;
$$;
revoke all on function private.route_vip_inbound_message() from public, anon, authenticated;
grant execute on function private.route_vip_inbound_message() to service_role;
drop trigger if exists route_vip_inbound_message on public.whatsapp_messages;
create trigger route_vip_inbound_message
after insert on public.whatsapp_messages
for each row execute function private.route_vip_inbound_message();
