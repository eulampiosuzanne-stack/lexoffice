-- Aditivo: mantém as 9 etapas atuais e acrescenta as do catálogo (funil do interessado + saídas alternativas).
-- Nenhum lead muda de etapa nesta migration.
alter table public.leads drop constraint if exists leads_stage_key_check;
alter table public.leads add constraint leads_stage_key_check check (stage_key = any (array[
  'novo_lead','contato_iniciado','qualificacao','consultoria','proposta','negociacao','contratado','cliente','perdido',
  'em_triagem','consulta_apresentada','aguardando_pagamento','pagamento_conferencia','consulta_paga',
  'agendamento_solicitado','agendado','consulta_realizada','contratacao_formalizacao',
  'aguardando_interessado','encaminhado_avaliacao','desistiu','nao_convertido'
]::text[]));
