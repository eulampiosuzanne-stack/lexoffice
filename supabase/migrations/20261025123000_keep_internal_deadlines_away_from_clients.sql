-- Clientes não recebem prazos internos nem datas técnicas.
-- O andamento ao cliente continua pela rotina própria, com linguagem tranquilizadora.
do $block$
declare
  ddl text;
  start_pos integer;
  end_pos integer;
  start_marker constant text := '      if dest is not null and not exists(select 1 from public.notification_queue q where q.payload->>''dedupe_key''=''deadline:client:''||r.id||'':''||d) then';
  end_marker constant text := '      if owner_phone is not null and not exists(select 1 from public.notification_queue q where q.payload->>''dedupe_key''=''deadline:office:''||r.id||'':''||d) then';
begin
  ddl := pg_get_functiondef('public.lexoffice_schedule_process_reminders()'::regprocedure);
  start_pos := strpos(ddl,start_marker);
  end_pos := strpos(ddl,end_marker);

  -- Permite reaplicar a migração com segurança.
  if start_pos > 0 and end_pos > start_pos then
    ddl := substring(ddl from 1 for start_pos-1)
      || '      -- Prazos e datas permanecem internos. O cliente recebe somente o andamento processual em linguagem tranquilizadora.'
      || chr(10) || chr(10)
      || substring(ddl from end_pos);
    execute ddl;
  end if;
end
$block$;

update public.notification_queue
set status='cancelled',
    last_error='cancelado: prazo interno não deve ser enviado ao cliente',
    payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object('cancel_reason','internal_deadline_not_for_client'),
    updated_at=now()
where payload->>'audience'='client'
  and payload->>'source'='process_deadline'
  and status in ('pending','queued','processing');
