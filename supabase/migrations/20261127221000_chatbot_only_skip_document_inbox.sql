-- Arquivo de pedido de documentos e a escolha dele são respondidos pelo pedido, não pelo menu do chatbot.
create or replace function private.chatbot_only_route()
returns trigger language plpgsql security definer set search_path to 'pg_catalog', 'public' as $function$
declare v_token text;
begin
  if new.direction <> 'inbound' then return new; end if;
  begin
    if coalesce(new.metadata->>'source', '') = 'document_inbox'
       or public.lex_is_document_choice(new.conversation_id, new.body, new.metadata->>'selected_row_id') then return new; end if;
    if exists (select 1 from public.whatsapp_conversations v
      join public.whatsapp_contacts w on w.id = v.contact_id
      join public.chatbot_only_contacts c on c.org_id = v.org_id and c.contact_key = regexp_replace(w.phone, '\D', '', 'g') and c.enabled
      where v.id = new.conversation_id and v.org_id = new.org_id) then
      select token into v_token from public.chatbot_only_secret where id;
      perform net.http_post(url := 'https://dcpwcuototomxoiszukt.supabase.co/functions/v1/chatbot-botoes',
        body := jsonb_build_object('message_id', new.id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-bot-token', v_token),
        timeout_milliseconds := 5000);
    end if;
  exception when others then raise warning 'chatbot_only_route: %', sqlerrm;
  end;
  return new;
end $function$;
