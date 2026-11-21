create or replace function public.lexoffice_alert_dedupe_pendencia() returns trigger language plpgsql set search_path=public as $$
declare janela interval;
begin
  begin
    if new.contact_phone is null or new.reason is null or new.reason like 'ADMIN_COMMAND_%' or new.reason like 'CLIENT_SCHEDULE_%' then return new; end if;
    janela := case when new.reason like 'Situação crítica%' or new.reason like 'URGENTE%' then interval '2 hours' else interval '6 hours' end;
    if exists (
      select 1 from public.ai_agent_alerts a
       where a.org_id is not distinct from new.org_id
         and a.contact_phone = new.contact_phone
         and a.alert_phone is not distinct from new.alert_phone
         and left(a.reason,40) = left(new.reason,40)
         and a.status in ('pending','summarizing','queued','processing','sent')
         and a.created_at > now() - janela
    ) then return null; end if;
  exception when others then return new;
  end;
  return new;
end $$;
create trigger trg_alert_dedupe_pendencia before insert on public.ai_agent_alerts for each row execute function public.lexoffice_alert_dedupe_pendencia();
