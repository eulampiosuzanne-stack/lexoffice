-- Recados deixados pelo WhatsApp: quando a Helena confirma que anotou, o recado é salvo de verdade.
create table if not exists public.whatsapp_recados (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  contact_name text,
  phone text,
  is_client boolean not null default false,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists whatsapp_recados_org_idx on public.whatsapp_recados (org_id, read_at, created_at desc);
alter table public.whatsapp_recados enable row level security;
revoke all on public.whatsapp_recados from anon, authenticated;
grant select, update (read_at) on public.whatsapp_recados to authenticated;
create policy whatsapp_recados_staff_select on public.whatsapp_recados for select to authenticated using (public.can_access_office_operational_data(org_id));
create policy whatsapp_recados_staff_update on public.whatsapp_recados for update to authenticated using (public.can_access_office_operational_data(org_id)) with check (public.can_access_office_operational_data(org_id));

create or replace function public.recado_confirmado(p_text text) returns boolean language sql immutable as $$
  select coalesce(p_text, '') ~* '(recado[^.!?]{0,40}(anotad|registrad)o|(já registrei|já anotei)[^.!?]{0,80}(recado|assunto))'
     and coalesce(p_text, '') !~* '(não|quando|assim que|depois que)[^.!?]{0,40}(anotad|registrad)'
$$;

create or replace function public.capture_whatsapp_recado() returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_phone text; v_client boolean; v_body text; v_id uuid;
begin
  if new.direction <> 'outbound' or coalesce(new.metadata->>'source', '') <> 'ai_agent' or not public.recado_confirmado(new.body) then return new; end if;
  select coalesce(nullif(k.name, ''), nullif(k.profile_name, ''), k.phone), k.phone, (c.client_id is not null or k.client_id is not null)
    into v_name, v_phone, v_client
    from whatsapp_conversations c left join whatsapp_contacts k on k.id = c.contact_id where c.id = new.conversation_id;
  select left(string_agg(m.body, E'\n' order by m.created_at), 2000) into v_body from whatsapp_messages m
    where m.conversation_id = new.conversation_id and m.direction = 'inbound' and coalesce(m.body, '') <> ''
      and m.created_at between new.created_at - interval '10 minutes' and new.created_at;
  if v_body is null then return new; end if;
  select id into v_id from whatsapp_recados where conversation_id = new.conversation_id and read_at is null and created_at > now() - interval '2 hours' limit 1;
  if v_id is not null then
    update whatsapp_recados set body = v_body where id = v_id;
  else
    insert into whatsapp_recados (org_id, conversation_id, contact_name, phone, is_client, body) values (new.org_id, new.conversation_id, v_name, v_phone, coalesce(v_client, false), v_body);
    insert into notifications (org_id, user_id, type, title, body, link, read)
      select new.org_id, p.id, 'service', 'Novo recado pelo WhatsApp', left(coalesce(v_name, v_phone, 'Contato') || ': ' || v_body, 700), '/atendimento/aplicativo', false
      from profiles p where p.org_id = new.org_id and p.role_key in ('owner', 'admin') and p.status = 'active';
  end if;
  return new;
exception when others then
  -- Nunca impedir o registro da mensagem por causa do recado.
  raise warning 'capture_whatsapp_recado: %', sqlerrm;
  return new;
end $$;
revoke all on function public.capture_whatsapp_recado() from public, anon, authenticated;
create trigger trg_capture_whatsapp_recado after insert on public.whatsapp_messages for each row execute function public.capture_whatsapp_recado();
