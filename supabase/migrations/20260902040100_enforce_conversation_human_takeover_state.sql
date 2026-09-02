create or replace function public.enforce_whatsapp_conversation_takeover() returns trigger language plpgsql as $$ begin
 if new.responsible_id is distinct from old.responsible_id or new.tags is distinct from old.tags then
   if new.responsible_id is not null or coalesce(new.tags,'{}'::text[]) @> array['support']::text[] then
     new.bot_ativo := false;
     new.human_takeover_at := coalesce(new.human_takeover_at, now());
     new.human_takeover_reason := coalesce(new.human_takeover_reason, 'operator_assignment');
   elsif old.responsible_id is not null or coalesce(old.tags,'{}'::text[]) @> array['support']::text[] then
     new.bot_ativo := true;
     new.human_takeover_at := null;
     new.human_takeover_by := null;
     new.human_takeover_reason := null;
   end if;
 end if;
 return new;
end; $$;
drop trigger if exists trg_whatsapp_conversation_takeover on public.whatsapp_conversations;
create trigger trg_whatsapp_conversation_takeover before update on public.whatsapp_conversations for each row execute function public.enforce_whatsapp_conversation_takeover();