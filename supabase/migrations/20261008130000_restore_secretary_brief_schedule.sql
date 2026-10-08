-- Restaura o agendamento original enquanto a Edge Function independente da Donna não pode ser publicada.
select cron.schedule(
  'lexoffice-secretary-daily-brief',
  '50 10 * * 1-5',
  'select public.lexoffice_secretary_daily_brief(false)'
);
