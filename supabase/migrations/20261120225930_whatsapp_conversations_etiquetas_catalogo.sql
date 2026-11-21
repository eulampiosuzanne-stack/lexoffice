-- Catálogo §20-23: etiquetas internas em whatsapp_conversations.tags (text[]), com prefixo por dimensão:
--   assunto:*  pendencia:*  prioridade:*  atendimento:*  seguranca:*   (as 'agent:*' continuam como estão)
create or replace function public.conversation_add_label(p_conversation uuid, p_label text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_conversation is null or coalesce(btrim(p_label),'')='' then return; end if;
  update public.whatsapp_conversations
     set tags = case when p_label = any(coalesce(tags,array[]::text[])) then tags else coalesce(tags,array[]::text[]) || p_label end
   where id = p_conversation and not (p_label = any(coalesce(tags,array[]::text[])));
end $$;

create or replace function public.conversation_remove_label(p_conversation uuid, p_label text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_conversation is null or coalesce(btrim(p_label),'')='' then return; end if;
  update public.whatsapp_conversations
     set tags = array_remove(coalesce(tags,array[]::text[]), p_label)
   where id = p_conversation and p_label = any(coalesce(tags,array[]::text[]));
end $$;

revoke all on function public.conversation_add_label(uuid,text) from public, anon, authenticated;
revoke all on function public.conversation_remove_label(uuid,text) from public, anon, authenticated;

-- Etiquetas do estado do atendimento (§23): ao mudar o estado, troca a etiqueta correspondente e nunca deixa uma antiga contradizendo a nova.
-- (a versão final desta função está na migration 20261120225947)
