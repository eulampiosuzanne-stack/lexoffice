create or replace function public.enforce_online_only_calendar_event() returns trigger language plpgsql as $$ begin
 if lower(coalesce(new.event_type,'')) in ('consultation','consultation_online','client_consultation') then
   if coalesce(new.meeting_mode,'online') <> 'online' then raise exception 'LEXOFFICE: consultas com clientes são exclusivamente online'; end if;
   if new.location is not null and btrim(new.location) <> '' and lower(new.location) not like '%meet.google.com%' and lower(new.location) not like '%zoom.us%' and lower(new.location) not like '%online%' and lower(new.location) not like '%virtual%' then raise exception 'LEXOFFICE: consulta presencial não permitida; use somente Google Meet ou Zoom'; end if;
 end if;
 return new;
end; $$;