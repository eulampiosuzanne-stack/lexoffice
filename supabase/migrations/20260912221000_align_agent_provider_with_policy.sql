-- Alinha provedor, modelo, temperatura e fallback à política de cada agente.
-- A política passa a ser a fonte operacional de verdade para o gateway de IA.

update public.ai_agents
set
  model = case agent_key
    when 'client_service_triage' then 'openai/gpt-oss-20b'
    when 'client_process_updates' then 'gemini-2.5-flash'
    when 'client_schedule_relationship' then 'openai/gpt-oss-20b'
    when 'sales' then 'gemini-2.5-flash'
    when 'billing' then 'gemini-2.5-flash'
    else model end,
  temperature = case agent_key
    when 'client_service_triage' then 0.35
    when 'client_process_updates' then 0.15
    when 'client_schedule_relationship' then 0.20
    when 'sales' then 0.40
    when 'billing' then 0.10
    else temperature end,
  updated_at = now()
where agent_key in ('client_service_triage','client_process_updates','client_schedule_relationship','sales','billing');

update public.ai_agent_policies p
set
  provider = case p.agent_key
    when 'client_service_triage' then 'groq'
    when 'client_process_updates' then 'gemini'
    when 'client_schedule_relationship' then 'groq'
    when 'sales' then 'gemini'
    when 'billing' then 'gemini'
    else p.provider end,
  model = case p.agent_key
    when 'client_service_triage' then 'openai/gpt-oss-20b'
    when 'client_process_updates' then 'gemini-2.5-flash'
    when 'client_schedule_relationship' then 'openai/gpt-oss-20b'
    when 'sales' then 'gemini-2.5-flash'
    when 'billing' then 'gemini-2.5-flash'
    else p.model end,
  policy = coalesce(p.policy,'{}'::jsonb) || case p.agent_key
    when 'client_service_triage' then jsonb_build_object(
      'temperature',0.35,'max_output_tokens',900,
      'fallback_enabled',true,'fallback_provider','gemini',
      'provider_locked_to_policy',true,'prompt_source','policy'
    )
    when 'client_process_updates' then jsonb_build_object(
      'temperature',0.15,'max_output_tokens',800,
      'fallback_enabled',false,'fallback_provider',null,
      'provider_locked_to_policy',true,'prompt_source','policy'
    )
    when 'client_schedule_relationship' then jsonb_build_object(
      'temperature',0.20,'max_output_tokens',700,
      'fallback_enabled',true,'fallback_provider','gemini',
      'provider_locked_to_policy',true,'prompt_source','policy'
    )
    when 'sales' then jsonb_build_object(
      'temperature',0.40,'max_output_tokens',1000,
      'fallback_enabled',true,'fallback_provider','groq',
      'provider_locked_to_policy',true,'prompt_source','policy'
    )
    when 'billing' then jsonb_build_object(
      'temperature',0.10,'max_output_tokens',700,
      'fallback_enabled',false,'fallback_provider',null,
      'provider_locked_to_policy',true,'prompt_source','policy'
    )
    else '{}'::jsonb end,
  updated_at = now()
where p.agent_key in ('client_service_triage','client_process_updates','client_schedule_relationship','sales','billing');
