-- Lembrete único para quem não escolheu opção em 10 minutos.
alter table public.chatbot_only_contacts add column if not exists reminded_at timestamptz;
select cron.schedule('lexoffice-chatbot-lembrete', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://dcpwcuototomxoiszukt.supabase.co/functions/v1/chatbot-botoes',
    body := jsonb_build_object('action', 'remind', 'conversation_id', v.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bot-token', (select token from public.chatbot_only_secret where id)),
    timeout_milliseconds := 5000)
  from public.chatbot_only_contacts c
  join public.whatsapp_contacts w on w.org_id = c.org_id and regexp_replace(w.phone, '\D', '', 'g') = c.contact_key
  join lateral (select id from public.whatsapp_conversations x where x.contact_id = w.id order by x.last_message_at desc nulls last limit 1) v on true
  where c.enabled and c.reminded_at is null and c.node in ('menu','novo','endereco','consultoria','agenda')
    and c.last_inbound_at between now() - interval '2 hours' and now() - interval '10 minutes';
$cron$);
