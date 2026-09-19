-- Keep the process-notification bridge available only to trusted roles.
revoke all on function public.lexoffice_bridge_process_notifications() from public, anon;
grant execute on function public.lexoffice_bridge_process_notifications() to authenticated, service_role;

-- Both indexes enforced the same key. Keep the partial index used by the
-- collection scheduler and remove the redundant copy.
drop index if exists public.collection_schedule_financial_entry_schedule_type_uq;
