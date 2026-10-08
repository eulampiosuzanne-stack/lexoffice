-- Agenda a rota diária da Donna às 07:00 em São Paulo (10:00 UTC).
select cron.schedule(
  'lexoffice-secretary-daily-brief',
  '0 10 * * *',
  $cron$
    select net.http_post(
      url := 'https://dcpwcuototomxoiszukt.supabase.co/functions/v1/whatsapp-send-message',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-donna-token', (select secret from public.system_runtime_secrets where key = 'donna_daily_brief_token')
      ),
      body := '{"action":"donna_daily_brief","source":"pg_cron"}'::jsonb,
      timeout_milliseconds := 10000
    );
  $cron$
);
