alter table public.organization_settings
  add column if not exists ideal_client_profile text;

update public.organization_settings
set ideal_client_profile = 'Demanda compatível com as áreas de atuação do escritório; fornece documentos completos e informações verdadeiras; compreende que a advocacia é obrigação de meio, sem promessa de resultado; respeita horários, canais e regras de atendimento; mantém comunicação respeitosa e objetiva; aceita a formalização por contrato; consegue pagar a entrada e manter parcelas compatíveis com sua renda; demonstra organização e intenção real de cumprir os pagamentos; compreende o escopo contratado e que serviços adicionais exigem nova contratação; participa do caso e atende às solicitações do escritório.'
where ideal_client_profile is null or btrim(ideal_client_profile) = '';

comment on column public.organization_settings.ideal_client_profile is
  'Critérios internos do escritório para orientar a análise comercial, sem decisão automática ou exclusão de clientes.';
