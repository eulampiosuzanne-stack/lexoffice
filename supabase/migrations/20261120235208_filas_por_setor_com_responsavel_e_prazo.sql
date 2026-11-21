create table if not exists public.atendimento_filas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  conversation_id uuid not null,
  queue_key text not null check (queue_key in ('recados','comprovante','documentos','agenda','app_suporte')),
  title text,
  status text not null default 'aberta' check (status in ('aberta','em_andamento','concluida','cancelada')),
  responsible text not null,
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists atendimento_filas_aberta_uq on public.atendimento_filas (conversation_id, queue_key) where status in ('aberta','em_andamento');
create index if not exists atendimento_filas_org_status_idx on public.atendimento_filas (org_id, status, due_at);
alter table public.atendimento_filas enable row level security;
create policy atendimento_filas_select on public.atendimento_filas for select to authenticated using (org_id in (select org_id from public.profiles where id = auth.uid()));
create policy atendimento_filas_update on public.atendimento_filas for update to authenticated using (org_id in (select org_id from public.profiles where id = auth.uid())) with check (org_id in (select org_id from public.profiles where id = auth.uid()));

create or replace function public.queue_enqueue(p_conversation uuid, p_queue text, p_title text default null) returns void language plpgsql security definer set search_path=public as $$
declare o uuid; resp text; prazo interval;
begin
  select org_id into o from whatsapp_conversations where id=p_conversation;
  if o is null then return; end if;
  resp := case p_queue when 'comprovante' then 'Dra. Gláucia' when 'agenda' then 'Dra. Gláucia' else 'Equipe administrativa' end;
  prazo := case p_queue when 'comprovante' then interval '4 hours' when 'documentos' then interval '24 hours' when 'recados' then interval '24 hours' else interval '8 hours' end;
  insert into atendimento_filas(org_id,conversation_id,queue_key,title,responsible,due_at) values (o,p_conversation,p_queue,p_title,resp,now()+prazo) on conflict do nothing;
end $$;
revoke all on function public.queue_enqueue(uuid,text,text) from public, anon, authenticated;

create or replace function public.queue_resolve(p_conversation uuid, p_queue text) returns void language plpgsql security definer set search_path=public as $$
begin
  update atendimento_filas set status='concluida', resolved_at=now() where conversation_id=p_conversation and queue_key=p_queue and status in ('aberta','em_andamento');
end $$;
revoke all on function public.queue_resolve(uuid,text) from public, anon, authenticated;

create or replace function public.trg_filas_from_labels() returns trigger language plpgsql security definer set search_path=public as $$
begin
  begin
    if new.action='added' then
      if new.label='assunto:recado_advogada' then perform queue_enqueue(new.conversation_id,'recados','Recado para a advogada'); end if;
      if new.label='pendencia:pagamento_em_conferencia' then perform queue_enqueue(new.conversation_id,'comprovante','Comprovante a conferir'); end if;
      if new.label='pendencia:aguardando_documentos' then perform queue_enqueue(new.conversation_id,'documentos','Documentos pendentes'); end if;
    else
      if new.label='pendencia:pagamento_em_conferencia' then perform queue_resolve(new.conversation_id,'comprovante'); end if;
      if new.label='pendencia:aguardando_documentos' then perform queue_resolve(new.conversation_id,'documentos'); end if;
    end if;
  exception when others then null;
  end;
  return null;
end $$;
create trigger trg_filas_from_labels after insert on public.conversation_label_events for each row execute function public.trg_filas_from_labels();
