-- Linha processual padrão do app do cliente (10 etapas), montada automaticamente
-- a partir dos andamentos. Mudança de etapa vira recado + push no app.

alter table public.client_case_steps add column if not exists description text;

set local lock_timeout = '15s';

create or replace function public.lexoffice_case_line_stages()
returns table(pos int, key text, label text, description text, pattern text)
language sql immutable as $$
  values
  (1,  'protocolo',       'Ação protocolada',         'O pedido foi apresentado à Justiça e o processo foi criado.',
       'distribu|protocol|autua|peti[cç][aã]o inicial|ajuiza'),
  (2,  'analise_inicial', 'Análise inicial do juiz',  'O juiz confere o pedido e pode decidir questões urgentes.',
       'despacho|emenda|tutela|liminar|gratuidade|conclus|decis[aã]o'),
  (3,  'citacao',         'Citação da outra parte',   'A outra parte é chamada oficialmente para participar do processo.',
       'cita[cç][aã]o|citad[oa]|mandado de cita|carta de cita'),
  (4,  'defesa',          'Defesa da outra parte',    'A outra parte apresenta a versão dela, e o escritório responde.',
       'contesta[cç]|reconven|revelia|r[eé]plica'),
  (5,  'audiencia',       'Audiência / conciliação',  'Momento de tentar um acordo ou de ouvir as partes.',
       'audi[eê]ncia|concilia|media[cç][aã]o|cejusc'),
  (6,  'provas',          'Provas',                   'Fase de perícias, estudos, testemunhas e documentos.',
       'per[ií]cia|perit[oa]|laudo|testemunh|instru[cç][aã]o|saneamento|saneador|especifica[cç][aã]o de provas|alega[cç][oõ]es finais|memoriais|estudo (social|psicossocial)'),
  (7,  'sentenca',        'Sentença',                 'O juiz decide o pedido.',
       'senten[cç]a|julgo (im)?procedente|proced[eê]ncia|homolog|tr[aâ]nsito em julgado|extin[cç][aã]o|processo extinto|resolu[cç][aã]o do m[eé]rito'),
  (8,  'recurso',         'Recurso',                  'Se alguma parte recorrer, o tribunal revisa a decisão.',
       'apela[cç][aã]o|recurso|agravo|embargos de declara|ac[oó]rd[aã]o|turma recursal|contrarraz'),
  (9,  'cumprimento',     'Cumprimento da decisão',   'Fase de fazer cumprir o que foi decidido (pagamento, entrega, visitas etc.).',
       'cumprimento de senten|execu[cç][aã]o|penhora|alvar[aá]|sisbajud|bacenjud|renajud|bloqueio de valores|precat[oó]rio\M|\mrpv\M'),
  (10, 'encerramento',    'Encerramento',             'O processo é finalizado e arquivado.',
       'arquivamento definitivo|arquivad[oa]s? definitivamente|baixa definitiva|arquivo definitivo|^\s*definitivo\M')
$$;

-- publicações/e-mails trazem o texto integral (cheio de termos genéricos): usa só o título
-- (e o "Título:" do Recorte OAB). DataJud traz complementos curtos do CNJ: título + complemento.
create or replace function public.lexoffice_case_line_movement_text(p_title text, p_description text, p_source text)
returns text language sql immutable as $$
  select coalesce(p_title, '') || case
    when coalesce(p_source, '') like 'datajud%' then ' ' || coalesce(p_description, '')
    when coalesce(p_source, '') = 'recorte_oab_email' then ' ' || coalesce((regexp_match(coalesce(p_description, ''), 'T[íi]tulo:\s*(.{1,80}?)\s*Publica[çc][ãa]o:'))[1], '')
    else '' end
$$;

create or replace function public.lexoffice_case_line_stage_matches(p_text text, p_pos int, p_pattern text)
returns boolean language sql immutable as $$
  select lower(coalesce(p_text, '')) ~ p_pattern
     -- "conclusos para sentença" ainda não é sentença
     and not (p_pos = 7 and lower(coalesce(p_text, '')) ~ 'conclus'
              and lower(coalesce(p_text, '')) !~ 'senten[cç]a (proferida|publicada|registrada)|julgo|homolog|tr[aâ]nsito')
     -- "sem interposição de recurso" não é recurso
     and not (p_pos = 8 and lower(coalesce(p_text, '')) ~ '(sem|n[aã]o houve|aus[eê]ncia de) (interposi[cç][aã]o de )?recurso')
     -- "alvará de soltura" é criminal, não cumprimento de decisão
     and not (p_pos = 9 and lower(coalesce(p_text, '')) ~ 'soltura')
$$;

create or replace function public.lexoffice_rebuild_case_line(p_process uuid, p_notify boolean default true)
returns text language plpgsql security definer set search_path = public as $$
declare pr record; v_matched int[]; v_cur int; v_prev_pos int; s record; v_status text; v_key text; v_label text; v_desc text;
begin
  select id, org_id, client_id, cnj_number, status, is_confidential into pr from public.processes where id = p_process;
  if pr.id is null or pr.client_id is null then return null; end if;

  select array_agg(distinct st.pos) into v_matched
    from public.process_movements m
   cross join public.lexoffice_case_line_stages() st
   where m.process_id = p_process
     and public.lexoffice_case_line_stage_matches(public.lexoffice_case_line_movement_text(m.title, m.description, m.source), st.pos, st.pattern);
  v_matched := coalesce(v_matched, '{}'::int[]);
  if lower(coalesce(pr.status, '')) in ('archived', 'closed') then v_matched := v_matched || 10; end if;
  v_cur := coalesce((select max(x) from unnest(v_matched) x), 1);

  select cs.position into v_prev_pos from public.client_case_steps cs
   where cs.process_id = p_process and cs.client_id = pr.client_id and cs.status = 'current' limit 1;

  for s in select * from public.lexoffice_case_line_stages() order by pos loop
    -- etapa anterior sem registro fica 'pending' (constraint da tabela); o app mostra como "sem registro"
    v_status := case when s.pos < v_cur then case when s.pos = 1 or s.pos = any(v_matched) then 'completed' else 'pending' end
                     when s.pos = v_cur then 'current' else 'pending' end;
    if s.pos = v_cur then v_key := s.key; v_label := s.label; v_desc := s.description; end if;
    insert into public.client_case_steps(org_id, client_id, process_id, step_key, label, position, status, completed_at, updated_at, description)
    values (pr.org_id, pr.client_id, p_process, s.key, s.label, s.pos, v_status,
            case when v_status = 'completed' then now() end, now(), s.description)
    on conflict (client_id, process_id, step_key) do update
      set label = excluded.label, position = excluded.position, description = excluded.description,
          status = excluded.status,
          completed_at = case when excluded.status = 'completed' then coalesce(public.client_case_steps.completed_at, now()) else null end,
          updated_at = case when public.client_case_steps.status is distinct from excluded.status then now() else public.client_case_steps.updated_at end;
  end loop;

  if p_notify and v_prev_pos is not null and v_cur > v_prev_pos and not coalesce(pr.is_confidential, false) then
    perform public.lexoffice_client_app_publish(pr.org_id, pr.client_id, 'Seu processo avançou de etapa',
      'O processo' || coalesce(' ' || pr.cnj_number, '') || ' chegou na etapa: ' || v_label || '.' || E'\n' || v_desc
        || case when v_cur in (7, 8) then E'\n\n' || 'A Dra. Suzanne vai entrar em contato para explicar o que isso significa para você.' else '' end,
      'processo', case when v_cur in (7, 8) then 'high' else 'normal' end, false,
      'client_case_steps', md5('case-line:' || p_process || ':' || v_key)::uuid,
      jsonb_build_object('process_id', p_process, 'kind', 'case_line_step', 'step_key', v_key, 'position', v_cur));
  end if;
  return v_key;
end $$;

revoke all on function public.lexoffice_rebuild_case_line(uuid, boolean) from public, anon, authenticated;

-- um recálculo por processo por comando (importações em lote não recalculam linha a linha)
create or replace function public.lexoffice_case_line_after_movements()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pid uuid;
begin
  for v_pid in select distinct process_id from new_rows where process_id is not null loop
    perform public.lexoffice_rebuild_case_line(v_pid, true);
  end loop;
  return null;
end $$;

create or replace trigger trg_case_line_after_movements
  after insert on public.process_movements
  referencing new table as new_rows
  for each statement execute function public.lexoffice_case_line_after_movements();

create or replace function public.lexoffice_case_line_after_process()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status or new.client_id is distinct from old.client_id then
    perform public.lexoffice_rebuild_case_line(new.id, new.client_id is not distinct from old.client_id);
  end if;
  return null;
end $$;

create or replace trigger trg_case_line_after_process
  after update of status, client_id on public.processes
  for each row execute function public.lexoffice_case_line_after_process();

-- leitura pelo app (só o próprio cliente, só processo não sigiloso)
create or replace function public.client_app_case_line(p_process_id uuid)
returns table(step_order int, step_key text, label text, description text, status text, summary text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  with s as (
    select s.*, max(s.position) filter (where s.status = 'current') over () cur
      from public.client_case_steps s
      join public.processes p on p.id = s.process_id and p.client_id = s.client_id
      join public.client_app_accounts a on a.client_id = s.client_id and a.user_id = auth.uid() and a.enabled = true
     where s.process_id = p_process_id and not coalesce(p.is_confidential, false))
  select s.position, s.step_key, s.label, s.description,
         case when s.status = 'pending' and s.position < s.cur then 'skipped' else s.status end,
         case when s.status = 'current' then (
           select t.summary from public.client_process_timeline t
            where t.process_id = s.process_id and t.status = 'current' order by t.updated_at desc limit 1) end,
         s.updated_at
    from s order by s.position
$$;

revoke all on function public.client_app_case_line(uuid) from public, anon;
grant execute on function public.client_app_case_line(uuid) to authenticated;

-- carga inicial (sem avisar ninguém)
select public.lexoffice_rebuild_case_line(id, false) from public.processes where client_id is not null;
