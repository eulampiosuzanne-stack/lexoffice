-- P0 security hardening: protect orchestration logs and privileged RPCs.

alter table public.ai_orchestrator_events enable row level security;
alter table public.whatsapp_outbound_gate_log enable row level security;

revoke all on table public.ai_orchestrator_events from anon, authenticated;
revoke all on table public.whatsapp_outbound_gate_log from anon, authenticated;
grant select on table public.ai_orchestrator_events to authenticated;
grant select on table public.whatsapp_outbound_gate_log to authenticated;

create policy ai_orchestrator_events_org_select
on public.ai_orchestrator_events
for select
to authenticated
using (org_id = (select public.current_org_id()));

create policy whatsapp_outbound_gate_log_org_select
on public.whatsapp_outbound_gate_log
for select
to authenticated
using (org_id = (select public.current_org_id()));

-- Trigger functions must not be callable through PostgREST RPC.
revoke all on function public.lexoffice_alert_movement_review() from public, anon, authenticated;
grant execute on function public.lexoffice_alert_movement_review() to service_role;

-- System-wide jobs are backend-only.
revoke all on function public.lexoffice_sync_lost_lead_followups() from public, anon, authenticated;
grant execute on function public.lexoffice_sync_lost_lead_followups() to service_role;
revoke all on function public.lexoffice_sync_financial_collections() from public, anon, authenticated;
grant execute on function public.lexoffice_sync_financial_collections() to service_role;
revoke all on function public.lexoffice_reconcile_client_process_financial(uuid) from public, anon, authenticated;
grant execute on function public.lexoffice_reconcile_client_process_financial(uuid) to service_role;
revoke all on function public.lexoffice_route_agent_handoff(uuid,uuid,uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.lexoffice_route_agent_handoff(uuid,uuid,uuid,text,text,jsonb) to service_role;

-- These helpers trust record IDs and bypass RLS; backend only.
revoke all on function public.calculate_installment_updated_amount(uuid) from public, anon, authenticated;
grant execute on function public.calculate_installment_updated_amount(uuid) to service_role;
revoke all on function public.create_installment_collection_schedule(uuid) from public, anon, authenticated;
grant execute on function public.create_installment_collection_schedule(uuid) to service_role;
revoke all on function public.schedule_next_overdue_collection(uuid) from public, anon, authenticated;
grant execute on function public.schedule_next_overdue_collection(uuid) to service_role;

-- Intentional authenticated RPCs retained:
-- cleanup_completed_import_rows: derives organization from current_org_id.
-- commit_import_job: validates job org against current_org_id.
-- schedule_hearing_reminders: validates hearing org against current_org_id.
-- current_org_id: tenant helper used by RLS/client operations.
