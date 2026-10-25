-- Relatório de andamento ao cliente: linguagem tranquila e metadados do layout visual.
do $patch$
declare
  ddl text;
  original text;
begin
  ddl := pg_get_functiondef('public.lexoffice_movement_to_client_app()'::regprocedure);
  original := ddl;

  ddl := replace(ddl,
$old$      'Houve uma movimentação importante no seu processo' || coalesce(' ' || p.cnj_number, '') || ': '
        || coalesce(nullif(btrim(new.title), ''), 'atualização processual') || '.' || E'\n\n'
        || 'A Dra. Suzanne vai entrar em contato para explicar o que isso significa para você.',$old$,
$new$      'O escritório identificou uma nova movimentação no seu processo' || coalesce(' ' || p.cnj_number, '') || ': '
        || coalesce(nullif(btrim(new.client_message), ''), nullif(btrim(new.title), ''), 'atualização processual') || '.' || E'\n\n'
        || 'Você não precisa fazer nada por enquanto. Nossa equipe já foi avisada e está cuidando das providências necessárias.',$new$);

  ddl := replace(ddl,
$old$      jsonb_build_object('process_id', p.id, 'movement_id', new.id, 'kind', 'movement_important'));$old$,
$new$      jsonb_build_object('process_id', p.id, 'movement_id', new.id, 'kind', 'movement_important', 'report_version', 2, 'next_update_at', (current_date + 7)));$new$);

  ddl := replace(ddl,
$old$            || E'\n' || v_list || E'\n\n' || 'Você não precisa fazer nada agora. O escritório está acompanhando e avisa se precisar de você.';$old$,
$new$            || E'\n' || v_list || E'\n\n' || 'Você não precisa fazer nada por enquanto. Nossa equipe já foi avisada e está cuidando das providências necessárias.';$new$);

  ddl := replace(ddl,
$old$    jsonb_build_object('process_id', p.id, 'kind', 'movement_digest', 'day', v_day));$old$,
$new$    jsonb_build_object('process_id', p.id, 'kind', 'movement_digest', 'day', v_day, 'report_version', 2, 'next_update_at', (v_day + 7)));$new$);

  if ddl <> original then execute ddl; end if;
end
$patch$;
