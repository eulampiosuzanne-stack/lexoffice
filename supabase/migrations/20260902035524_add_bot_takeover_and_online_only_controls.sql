alter table public.whatsapp_conversations add column if not exists bot_ativo boolean not null default true;
alter table public.whatsapp_conversations add column if not exists human_takeover_at timestamptz;
alter table public.whatsapp_conversations add column if not exists human_takeover_by uuid;
alter table public.whatsapp_conversations add column if not exists human_takeover_reason text;
alter table public.whatsapp_settings add column if not exists online_only_appointments boolean not null default true;
alter table public.whatsapp_settings add column if not exists online_meeting_provider text not null default 'google_meet';
alter table public.calendar_events add column if not exists meeting_mode text not null default 'online';
alter table public.calendar_events add column if not exists meeting_url text;
update public.whatsapp_settings set online_only_appointments=true where online_only_appointments is distinct from true;
create or replace function public.enforce_online_only_calendar_event() returns trigger language plpgsql as $$ begin
 if coalesce(new.meeting_mode,'online') <> 'online' then raise exception 'LEXOFFICE: agendamentos presenciais são proibidos; use modalidade online'; end if;
 if new.location is not null and btrim(new.location) <> '' and lower(new.location) not like '%meet.google.com%' and lower(new.location) not like '%zoom.us%' and lower(new.location) not like '%online%' and lower(new.location) not like '%virtual%' then raise exception 'LEXOFFICE: local físico não permitido; informe somente link/modalidade online'; end if;
 return new; end; $$;
drop trigger if exists trg_calendar_events_online_only on public.calendar_events;
create trigger trg_calendar_events_online_only before insert or update on public.calendar_events for each row execute function public.enforce_online_only_calendar_event();