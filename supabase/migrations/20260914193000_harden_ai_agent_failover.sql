update public.ai_agent_policies
set policy = coalesce(policy,'{}'::jsonb) || jsonb_build_object(
  'fallback_enabled', true,
  'fallback_provider', case
    when lower(coalesce(provider,'')) = 'gemini' then 'groq'
    when lower(coalesce(provider,'')) = 'groq' then 'gemini'
    when lower(coalesce(provider,'')) = 'openai' then 'gemini'
    else coalesce(nullif(policy->>'fallback_provider',''),'gemini')
  end
),
active = true,
updated_at = now()
where agent_key in (
  'client_service_triage',
  'client_process_updates',
  'client_schedule_relationship',
  'sales',
  'billing'
);

update public.ai_agents
set is_active = true,
    updated_at = now()
where agent_key in (
  'client_service_triage',
  'client_process_updates',
  'client_schedule_relationship',
  'sales',
  'billing'
);

update public.whatsapp_settings
set ai_enabled = true,
    updated_at = now()
where ai_enabled is distinct from true;
