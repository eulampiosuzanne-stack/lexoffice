-- Harden legal email ingestion and privileged RPC access without breaking authenticated trigger execution.

alter table public.legal_email_ingest_queue enable row level security;
revoke all on table public.legal_email_ingest_queue from anon;
revoke all on table public.legal_email_ingest_queue from authenticated;
grant select, insert, update, delete on table public.legal_email_ingest_queue to authenticated;
drop policy if exists legal_email_ingest_queue_org_access on public.legal_email_ingest_queue;
create policy legal_email_ingest_queue_org_access
on public.legal_email_ingest_queue
for all to authenticated
using (org_id = (select public.current_org_id()))
with check (org_id = (select public.current_org_id()));

alter table public.legal_email_sync_runs enable row level security;
revoke all on table public.legal_email_sync_runs from anon, authenticated;
grant all on table public.legal_email_sync_runs to service_role;

-- Tenant authorization helpers remain available to signed-in users, never anonymous callers.
revoke all on function public.can_edit_owner_process_data(uuid,uuid) from public, anon;
revoke all on function public.can_view_owner_process_data(uuid,uuid) from public, anon;
grant execute on function public.can_edit_owner_process_data(uuid,uuid) to authenticated, service_role;
grant execute on function public.can_view_owner_process_data(uuid,uuid) to authenticated, service_role;

-- Trigger functions must execute for authenticated table writes, but are not exposed to anonymous users.
revoke execute on function public.lexoffice_guard_tribunal_connection_owner() from public, anon;
revoke execute on function public.lexoffice_guard_tribunal_sync_job_owner() from public, anon;
revoke execute on function public.lexoffice_hard_stop_ai_on_human_whatsapp_message() from public, anon;
grant execute on function public.lexoffice_guard_tribunal_connection_owner() to authenticated, service_role;
grant execute on function public.lexoffice_guard_tribunal_sync_job_owner() to authenticated, service_role;
grant execute on function public.lexoffice_hard_stop_ai_on_human_whatsapp_message() to authenticated, service_role;

-- System jobs are backend-only.
revoke all on function public.lexoffice_schedule_unlinked_hearing_reminders() from public, anon, authenticated;
revoke all on function public.lexoffice_sync_financial_precollections() from public, anon, authenticated;
grant execute on function public.lexoffice_schedule_unlinked_hearing_reminders() to service_role;
grant execute on function public.lexoffice_sync_financial_precollections() to service_role;

alter function public.br_phone_core(text) set search_path = public, pg_temp;
