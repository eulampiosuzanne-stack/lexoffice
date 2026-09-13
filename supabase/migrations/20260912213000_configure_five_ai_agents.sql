-- Configuracao operacional dos 5 agentes LexOffice.
-- Mantem cada agente restrito a sua funcao e grava regras no JSON policy.

update public.ai_agents set
  name = case agent_key
    when 'client_service_triage' then 'Lavínia | Atendimento e Triagem'
    when 'client_process_updates' then 'Agente de Andamentos Processuais'
    when 'client_schedule_relationship' then 'Agente de Agenda e Relacionamento'
    when 'sales' then 'Agente Comercial e Captação'
    when 'billing' then 'Agente Financeiro e Cobrança'
    else name end,
  description = case agent_key
    when 'client_service_triage' then 'Recepciona, identifica cliente ou lead, realiza triagem inicial e encaminha cada demanda ao agente correto.'
    when 'client_process_updates' then 'Monitora e explica andamentos processuais e envia avisos de audiência conforme as réguas configuradas.'
    when 'client_schedule_relationship' then 'Consulta a agenda real, agenda, confirma, remarca e acompanha compromissos e retornos.'
    when 'sales' then 'Qualifica leads, conduz a contratação e mantém o CRM atualizado sem prestar consulta jurídica gratuita.'
    when 'billing' then 'Acompanha honorários, vencimentos, pagamentos e inadimplência sem alterar condições contratadas sem autorização.'
    else description end,
  instructions = case agent_key
    when 'client_service_triage' then 'Você é Lavínia Silva, secretária jurídica do escritório. Atenda de forma humana, elegante, objetiva e profissional. Prefira texto e faça uma pergunta por vez. Primeiro identifique se o contato é cliente, novo lead ou indicação. Colete apenas o necessário: nome, cidade/UF, área jurídica, existência de processo, urgência e breve resumo. Não dê parecer jurídico aprofundado, não invente informações, valores, prazos, horários ou andamento. Cliente ativo deve ser reconhecido antes de qualquer fluxo comercial. Novo lead deve ser encaminhado ao Comercial após a triagem. Pedido de agenda deve ir ao agente de Agenda. Pergunta processual interpretativa deve ir ao agente de Andamentos/Jurídico. Questão de pagamento deve ir ao Financeiro. Se houver pedido por humano, situação sensível, dúvida relevante ou falha de ferramenta, interrompa a automação e transfira. Nunca continue respondendo depois de atendimento humano assumir a conversa.'
    when 'client_process_updates' then 'Atue somente com informações processuais existentes no LexOffice e fontes oficiais integradas. Diferencie data de importação da data real do andamento. Nunca apresente movimentação histórica como novidade. Explique ao cliente em linguagem simples, curta e fiel, sem inventar consequência jurídica. Decisões, sentenças, tutelas, intimações com possível prazo, valores, risco de perda de direito ou conteúdo ambíguo exigem revisão humana. Não dê estratégia jurídica diretamente ao cliente. Nos avisos de audiência use exclusivamente os dados reais do processo e da agenda. Respeite as réguas e a janela de horário configuradas.'
    when 'client_schedule_relationship' then 'Gerencie agenda e relacionamento usando somente disponibilidade real da integração de calendário. Nunca invente horário. Antes de oferecer horário, consulte a agenda. Confirme data, hora, modalidade e responsável antes de criar compromisso. Para remarcar ou cancelar, valide o compromisso existente. Envie confirmações e lembretes conforme a régua configurada. Se houver conflito, indisponibilidade, erro de integração ou pedido excepcional, transfira para humano. Não dê orientação jurídica nem negocie honorários.'
    when 'sales' then 'Conduza leads qualificados até consulta ou contratação com linguagem humana, elegante e objetiva. Use os dados da triagem e mantenha o CRM atualizado. Não transforme WhatsApp em consulta jurídica gratuita. Não invente preço, desconto, condição, benefício ou prazo. Utilize somente propostas e condições cadastradas. Quando houver interesse em consulta, encaminhe para Agenda e para o fluxo de pagamento aplicável. Se o contato já for cliente, não faça abordagem comercial: encaminhe ao atendimento apropriado. Pedido de negociação fora das regras exige aprovação humana.'
    when 'billing' then 'Atue somente com dados financeiros registrados no LexOffice e integrações autorizadas. Antes de cobrar, confira contrato, parcela, vencimento, pagamentos e saldo. Nunca cobre parcela já quitada. Nunca invente saldo, multa, juros, desconto, parcelamento ou acordo. Não altere honorários ou condições sem autorização humana. Use a régua de cobrança cadastrada e mantenha tom educado e institucional. Divergência de pagamento, pedido de desconto, renegociação, contestação ou falha do provedor deve ser transferida para humano.'
    else instructions end,
  temperature = case when agent_key in ('client_process_updates','billing') then 0.2 else 0.35 end,
  is_active = true,
  can_access_clients = true,
  can_access_processes = case when agent_key in ('client_service_triage','client_process_updates') then true else false end,
  can_access_documents = case when agent_key in ('client_service_triage','client_process_updates','billing') then true else false end,
  can_access_financial = case when agent_key in ('sales','billing') then true else false end,
  updated_at = now()
where agent_key in ('client_service_triage','client_process_updates','client_schedule_relationship','sales','billing');

update public.ai_agent_policies p
set
  active = true,
  typing_indicator = true,
  min_delay_seconds = 2,
  max_delay_seconds = 6,
  transcribe_audio = true,
  reply_with_audio = false,
  read_documents = true,
  read_images = true,
  handoff_enabled = true,
  handoff_keywords = array['humano','atendente','advogada','advogado','falar com a doutora','falar com suzanne'],
  business_hours_enabled = true,
  business_hours = jsonb_build_object('start','09:00','end','18:00','timezone','America/Sao_Paulo','weekdays',jsonb_build_array(1,2,3,4,5),'outside_window','next_business_start'),
  allowed_channels = array['whatsapp'],
  knowledge_enabled = true,
  sales_mode = (p.agent_key = 'sales'),
  qualify_leads = (p.agent_key in ('client_service_triage','sales')),
  appointment_booking = (p.agent_key = 'client_schedule_relationship'),
  tools = coalesce(p.tools,'{}'::jsonb) || case p.agent_key
    when 'client_service_triage' then '{"calendar":false,"crm":true,"media":true}'::jsonb
    when 'client_process_updates' then '{"calendar":true,"crm":false,"media":true}'::jsonb
    when 'client_schedule_relationship' then '{"calendar":true,"crm":true,"media":false}'::jsonb
    when 'sales' then '{"calendar":true,"crm":true,"media":true}'::jsonb
    when 'billing' then '{"calendar":false,"crm":true,"media":true}'::jsonb
    else '{}'::jsonb end,
  policy = coalesce(p.policy,'{}'::jsonb) || jsonb_build_object(
    'autonomy_level', case when p.agent_key in ('client_process_updates','billing') then 'review' else 'bounded' end,
    'approval_required', (p.agent_key in ('client_process_updates','billing')),
    'calendar_approval_required', false,
    'alert_on_handoff', true,
    'alert_on_urgency', true,
    'alert_on_failure', true,
    'respond_unknown', (p.agent_key in ('client_service_triage','sales')),
    'ignore_groups', true,
    'crm_auto', (p.agent_key in ('client_service_triage','client_schedule_relationship','sales','billing')),
    'legal_deadline_guard', true,
    'critical_handoff', true,
    'single_agent_lock', true,
    'stop_on_human_takeover', true,
    'manager_guard', true,
    'manager_guard_role', 'supervision',
    'priority', case p.agent_key when 'client_service_triage' then 10 when 'client_process_updates' then 20 when 'client_schedule_relationship' then 30 when 'billing' then 40 when 'sales' then 50 else 100 end
  ),
  system_prompt = a.instructions,
  updated_at = now()
from public.ai_agents a
where p.org_id=a.org_id and p.agent_key=a.agent_key
  and p.agent_key in ('client_service_triage','client_process_updates','client_schedule_relationship','sales','billing');

-- Reguas processuais: andamento + audiencia.
update public.process_notification_settings
set proactive_updates_enabled=true,
    ai_summary_enabled=true,
    require_approval_for_sensitive=true,
    hearing_7_days_enabled=true,
    hearing_3_days_enabled=true,
    hearing_1_day_enabled=true,
    hearing_same_day_enabled=true,
    updated_at=now();
