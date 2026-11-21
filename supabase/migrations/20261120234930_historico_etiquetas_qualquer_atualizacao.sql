create or replace trigger trg_log_conversation_label_events after update on public.whatsapp_conversations
  for each row when (old.tags is distinct from new.tags) execute function public.trg_log_conversation_label_events();
