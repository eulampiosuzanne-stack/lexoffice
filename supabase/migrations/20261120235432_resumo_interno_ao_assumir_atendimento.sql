create or replace function public.trg_zz3_handoff_summary() returns trigger language plpgsql security definer set search_path=public as $$
declare nm text; hist text; resumo text;
begin
  begin
    if new.bot_ativo is false and old.bot_ativo is distinct from false then
      select coalesce(c.name, l.name, ct.name, ct.profile_name) into nm
        from (select 1) x
        left join clients c on c.id = new.client_id
        left join leads l on l.id = new.lead_id
        left join whatsapp_contacts ct on ct.id = new.contact_id;
      select string_agg(t, E'\n' order by ts) into hist from (
        select created_at ts, (case when direction='inbound' then 'Pessoa: ' else 'Escritório: ' end) || left(regexp_replace(coalesce(body,''), '\s+', ' ', 'g'), 140) t
          from whatsapp_messages
         where conversation_id = new.id and coalesce(body,'') !~* '^(\S{1,3}\s*)?LEXOFFICE\s*•' and coalesce(body,'') !~* '^Recado recebido'
         order by created_at desc limit 6) h;
      resumo := 'Contato: ' || coalesce(nm,'nome não informado')
        || E'\nTipo: ' || case when new.client_id is not null then 'cliente' when new.lead_id is not null then 'interessado' else 'não identificado' end
        || E'\nEtiquetas: ' || coalesce(array_to_string(new.tags, ', '),'nenhuma')
        || E'\nMotivo da transferência: ' || coalesce(new.human_takeover_reason,'não informado')
        || E'\nÚltimas mensagens:\n' || coalesce(hist,'sem mensagens');
      new.chatbot_context := coalesce(new.chatbot_context,'{}'::jsonb) || jsonb_build_object('resumo_interno', resumo, 'resumo_interno_em', now());
    end if;
  exception when others then null;
  end;
  return new;
end $$;
create trigger trg_zz3_handoff_summary before update of bot_ativo on public.whatsapp_conversations for each row execute function public.trg_zz3_handoff_summary();
