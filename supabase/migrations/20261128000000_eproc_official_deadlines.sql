-- Prazos oficiais do eproc entram sozinhos na LEX (pedido da Dra. Suzanne em 27/11/2026).
-- Aditiva: não apaga nada. Estimativas substituídas ficam como 'cancelled' (reversível).
create table if not exists public.eproc_deadline_links (
  org_id uuid not null,
  key text not null,
  cnj text not null,
  evento text,
  inicio timestamptz,
  final timestamptz not null,
  deadline_id uuid references public.process_deadlines(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (org_id, key)
);
alter table public.eproc_deadline_links enable row level security;

create or replace function public.lex_apply_eproc_deadlines(p_org uuid, p_owner uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  r record; l public.eproc_deadline_links%rowtype; pr record;
  v_dig text; v_key text; v_dl uuid; v_ev uuid; v_title text; v_desc text; v_when text; v_prio text;
  n_new int := 0; n_upd int := 0; n_same int := 0; n_sub int := 0; n_noproc int := 0; n_bad int := 0; v_c int;
begin
  perform pg_advisory_xact_lock(hashtext('eproc_deadlines:' || p_org::text));
  for r in
    select * from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
      as x(cnj text, classe text, assunto text, evento text, envio timestamptz, inicio timestamptz, final timestamptz)
    order by final
  loop
    v_dig := regexp_replace(coalesce(r.cnj, ''), '[^0-9]', '', 'g');
    if length(v_dig) <> 20 or r.final is null then n_bad := n_bad + 1; continue; end if;
    v_key := v_dig || '|' || coalesce(extract(epoch from r.envio)::bigint::text, '') || '|' || md5(coalesce(r.evento, ''));

    select p.id, p.client_id, c.name as client_name into pr
      from processes p left join clients c on c.id = p.client_id
     where p.org_id = p_org and regexp_replace(coalesce(p.cnj_number, ''), '[^0-9]', '', 'g') = v_dig
     order by (p.client_id is null), p.created_at limit 1;
    if pr.id is null then n_noproc := n_noproc + 1; end if;

    v_when := to_char(r.final at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
    v_title := left('Prazo eproc — ' || r.cnj || coalesce(' — ' || pr.client_name, '') || case when pr.id is null then ' (processo não cadastrado)' else '' end, 240);
    v_desc := left('Data oficial do eproc. Final do prazo: ' || v_when
      || coalesce(E'\nInício: ' || to_char(r.inicio at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), '')
      || coalesce(E'\nEvento: ' || nullif(r.evento, ''), '')
      || coalesce(E'\nClasse: ' || nullif(r.classe, ''), '')
      || coalesce(E'\nAssunto: ' || nullif(r.assunto, ''), ''), 4000);
    v_prio := case when r.final < now() + interval '3 days' then 'urgent' else 'high' end;

    select * into l from eproc_deadline_links where org_id = p_org and key = v_key;
    v_dl := l.deadline_id;
    -- outra linha do mesmo processo com a mesma data final = o mesmo prazo
    if v_dl is null or l.final is distinct from r.final then
      select x.deadline_id into v_dl from eproc_deadline_links x
       where x.org_id = p_org and regexp_replace(x.cnj, '[^0-9]', '', 'g') = v_dig and x.final = r.final and x.deadline_id is not null limit 1;
      if v_dl is null and l.deadline_id is not null
         and not exists (select 1 from eproc_deadline_links x where x.org_id = p_org and x.key <> v_key and x.deadline_id = l.deadline_id) then
        -- o eproc recalculou a data (feriado, suspensão): atualiza o mesmo prazo
        v_dl := l.deadline_id;
        update process_deadlines set due_at = r.final, description = v_desc, priority = v_prio,
               status = 'pending', completed_at = null, updated_at = now()
         where id = v_dl returning source_calendar_event_id into v_ev;
        update calendar_events set starts_at = date_trunc('day', r.final at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' + interval '9 hours',
               ends_at = date_trunc('day', r.final at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' + interval '9 hours 30 minutes',
               description = v_desc, status = 'scheduled' where id = v_ev;
        n_upd := n_upd + 1;
      end if;
    end if;

    if v_dl is null then
      insert into calendar_events (org_id, title, description, status, all_day, starts_at, ends_at, priority, client_id, process_id, event_type, owner_user_id)
      values (p_org, left('[PRAZO eproc] ' || r.cnj || coalesce(' — ' || pr.client_name, ''), 240), v_desc, 'scheduled', false,
        date_trunc('day', r.final at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' + interval '9 hours',
        date_trunc('day', r.final at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' + interval '9 hours 30 minutes',
        v_prio, pr.client_id, pr.id, 'deadline', p_owner)
      returning id into v_ev;
      insert into process_deadlines (org_id, process_id, client_id, title, description, deadline_type, due_at, priority, status,
        remind_7_days, remind_3_days, remind_1_day, remind_same_day, source_calendar_event_id, source_kind, owner_user_id)
      values (p_org, pr.id, pr.client_id, v_title, v_desc, 'intimacao', r.final, v_prio, 'pending',
        false, true, true, true, v_ev, 'eproc_robo', p_owner)
      returning id into v_dl;
      n_new := n_new + 1;
    elsif l.key is not null and l.final = r.final then
      n_same := n_same + 1;
    end if;

    insert into eproc_deadline_links (org_id, key, cnj, evento, inicio, final, deadline_id)
    values (p_org, v_key, r.cnj, r.evento, r.inicio, r.final, v_dl)
    on conflict (org_id, key) do update set final = excluded.final, inicio = excluded.inicio, deadline_id = excluded.deadline_id, last_seen_at = now();

    -- estimativas (e anotações antigas do painel) da mesma intimação saem da lista de pendentes
    if r.inicio is not null then
      with velhos as (
        update process_deadlines d set status = 'cancelled', updated_at = now(),
               description = left(coalesce(d.description, '') || E'\n[Substituído pelo prazo oficial do eproc: ' || v_when || ']', 4000)
          from processes p
         where d.process_id = p.id and d.org_id = p_org
           and regexp_replace(coalesce(p.cnj_number, ''), '[^0-9]', '', 'g') = v_dig
           and d.status in ('pending', 'overdue') and d.source_kind in ('intimation_engine', 'eproc_painel')
           and d.due_at >= r.inicio and d.due_at <= r.final + interval '10 days'
        returning d.source_calendar_event_id
      ), ag as (
        update calendar_events c set status = 'cancelled' from velhos v where c.id = v.source_calendar_event_id returning 1
      )
      select count(*) into v_c from velhos;
      n_sub := n_sub + v_c;
    end if;
  end loop;
  return jsonb_build_object('novos', n_new, 'atualizados', n_upd, 'iguais', n_same, 'substituidos', n_sub,
    'sem_cadastro', n_noproc, 'linhas_invalidas', n_bad);
end $$;

-- Aviso dentro da LEX (não vai para o WhatsApp) do que vence hoje e amanhã.
create or replace function public.lex_eproc_deadline_alerts(p_org uuid, p_owner uuid)
returns int language plpgsql security definer set search_path to 'public' as $$
declare v_today date := (now() at time zone 'America/Sao_Paulo')::date; n int;
begin
  insert into notifications (org_id, user_id, type, title, body, link, read)
  select p_org, p_owner, 'deadline',
         case when (d.due_at at time zone 'America/Sao_Paulo')::date = v_today then 'PRAZO VENCE HOJE' else 'Prazo vence amanhã' end,
         d.title || ' — até ' || to_char(d.due_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), '/agenda', false
    from process_deadlines d
   where d.org_id = p_org and d.source_kind = 'eproc_robo' and d.status in ('pending', 'overdue')
     and (d.due_at at time zone 'America/Sao_Paulo')::date between v_today and v_today + 1
     and not exists (select 1 from notifications x where x.user_id = p_owner and x.type = 'deadline'
       and x.body like d.title || ' — %' and (x.created_at at time zone 'America/Sao_Paulo')::date = v_today);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.lex_apply_eproc_deadlines(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.lex_eproc_deadline_alerts(uuid, uuid) from public, anon, authenticated;
grant execute on function public.lex_apply_eproc_deadlines(uuid, uuid, jsonb) to service_role;
grant execute on function public.lex_eproc_deadline_alerts(uuid, uuid) to service_role;
