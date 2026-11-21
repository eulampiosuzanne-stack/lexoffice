create table if not exists public.conversation_label_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  org_id uuid,
  label text not null,
  action text not null check (action in ('added','removed')),
  created_at timestamptz not null default now()
);
create index if not exists conversation_label_events_conv_idx on public.conversation_label_events (conversation_id, created_at desc);
alter table public.conversation_label_events enable row level security;

create or replace function public.trg_log_conversation_label_events() returns trigger language plpgsql security definer set search_path=public as $$
declare l text;
begin
  begin
    for l in select unnest(coalesce(new.tags,array[]::text[])) except select unnest(coalesce(old.tags,array[]::text[])) loop
      insert into conversation_label_events(conversation_id,org_id,label,action) values (new.id,new.org_id,l,'added');
    end loop;
    for l in select unnest(coalesce(old.tags,array[]::text[])) except select unnest(coalesce(new.tags,array[]::text[])) loop
      insert into conversation_label_events(conversation_id,org_id,label,action) values (new.id,new.org_id,l,'removed');
    end loop;
  exception when others then null;
  end;
  return null;
end $$;
create trigger trg_log_conversation_label_events after update of tags on public.whatsapp_conversations
  for each row when (old.tags is distinct from new.tags) execute function public.trg_log_conversation_label_events();

create or replace function public.trg_zz2_conversation_contact_labels() returns trigger language plpgsql as $$
begin
  begin
    if new.client_id is not null then
      new.tags := array_remove(coalesce(new.tags,array[]::text[]),'contato:interessado'::text);
      if not ('contato:cliente_identificado'::text = any(new.tags)) then new.tags := array_append(new.tags,'contato:cliente_identificado'::text); end if;
    elsif new.lead_id is not null then
      if not ('contato:interessado'::text = any(coalesce(new.tags,array[]::text[]))) then new.tags := array_append(coalesce(new.tags,array[]::text[]),'contato:interessado'::text); end if;
    end if;
  exception when others then null;
  end;
  return new;
end $$;
create trigger trg_zz2_conversation_contact_labels before insert or update of client_id, lead_id on public.whatsapp_conversations
  for each row execute function public.trg_zz2_conversation_contact_labels();

create or replace function public.trg_payment_receipt_labels() returns trigger language plpgsql security definer set search_path=public as $$
begin
  begin
    update whatsapp_conversations c set tags = array_append(array_remove(coalesce(c.tags,array[]::text[]),'pendencia:pagamento_em_conferencia'::text),'financeiro:pagamento_confirmado'::text)
     where c.org_id=new.org_id and ((new.lead_id is not null and c.lead_id=new.lead_id) or (new.client_id is not null and c.client_id=new.client_id))
       and not ('financeiro:pagamento_confirmado'::text = any(coalesce(c.tags,array[]::text[])));
  exception when others then null;
  end;
  return null;
end $$;
create trigger trg_payment_receipt_labels after insert on public.payment_receipts for each row execute function public.trg_payment_receipt_labels();
