create or replace function public.lexoffice_sync_process_notification_sent()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare source_id uuid;
begin
  if new.status <> 'sent' or not (coalesce(new.payload,'{}'::jsonb) ? 'process_notification_queue_id') then
    return new;
  end if;
  begin
    source_id := (new.payload->>'process_notification_queue_id')::uuid;
  exception when invalid_text_representation then
    return new;
  end;
  update public.process_notification_queue
     set status='sent',
         sent_at=coalesce(sent_at,new.sent_at,now()),
         external_message_id=coalesce(external_message_id,new.id::text),
         last_error=null
   where id=source_id and status<>'sent';
  return new;
end
$$;

revoke all on function public.lexoffice_sync_process_notification_sent() from public,anon,authenticated;
grant execute on function public.lexoffice_sync_process_notification_sent() to service_role;

drop trigger if exists trg_sync_process_notification_sent on public.notification_queue;
create trigger trg_sync_process_notification_sent
after insert or update of status,sent_at on public.notification_queue
for each row execute function public.lexoffice_sync_process_notification_sent();
