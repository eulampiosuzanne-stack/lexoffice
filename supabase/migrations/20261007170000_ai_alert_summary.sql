-- Alertas de vendas e financeiro ganham um resumo por IA antes de serem enviados à Dra. Suzanne (07/10/2026).
-- O resumo é gerado pela edge function signature-reminder-worker (action=summarize_alert).
-- Se o resumo falhar, o alerta é liberado sem resumo (nunca deixa de avisar).
create or replace function public.lexoffice_alert_hold_for_summary() returns trigger language plpgsql set search_path=public as $$
begin
  if new.agent_key in ('sales','billing') and coalesce(new.status,'pending')='pending' then new.status := 'summarizing'; end if;
  return new;
end $$;
create or replace function public.lexoffice_alert_request_summary() returns trigger language plpgsql security definer set search_path=public as $$
begin
  begin
    perform net.http_post(
      url := 'https://dcpwcuototomxoiszukt.supabase.co/functions/v1/signature-reminder-worker',
      headers := jsonb_build_object('Content-Type','application/json','x-sync-token',(select secret from public.system_runtime_secrets where key='datajud_sync_token' limit 1)),
      body := jsonb_build_object('action','summarize_alert','alert_id',new.id),
      timeout_milliseconds := 45000);
  exception when others then
    update public.ai_agent_alerts set status='pending' where id=new.id and status='summarizing';
  end;
  return null;
end $$;
create trigger ai_alert_hold_for_summary before insert on public.ai_agent_alerts for each row execute function public.lexoffice_alert_hold_for_summary();
create trigger ai_alert_request_summary after insert on public.ai_agent_alerts for each row when (new.status='summarizing') execute function public.lexoffice_alert_request_summary();
