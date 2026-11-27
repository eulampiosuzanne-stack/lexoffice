-- 26/11/2026 (Dra. Suzanne): contatos marcados com a etiqueta 'sem_helena' nunca conversam com a Helena.
-- Vale também quando a conversa é nova ou quando uma rotina tenta reativar o robô. Não bloqueia avisos do escritório.
create or replace function public.lexoffice_keep_helena_off()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if exists (select 1 from whatsapp_contacts c where c.id=new.contact_id and c.org_id=new.org_id and coalesce(c.tags::text,'') ~ '\msem_helena\M') then
    new.bot_ativo := false;
    new.conversation_owner := 'HUMAN';
    new.owner_agent_key := null;
    new.human_takeover_at := coalesce(new.human_takeover_at, now());
    new.human_takeover_reason := 'vip_auto_handoff';
  end if;
  return new;
end $$;
drop trigger if exists zz_keep_helena_off on public.whatsapp_conversations;
create trigger zz_keep_helena_off before insert or update on public.whatsapp_conversations
  for each row execute function public.lexoffice_keep_helena_off();
