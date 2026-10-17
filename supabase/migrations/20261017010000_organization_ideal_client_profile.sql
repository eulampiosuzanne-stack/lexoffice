alter table public.organization_settings
  add column if not exists ideal_client_profile text;

update public.organization_settings
set ideal_client_profile = 'Cliente com renda minimamente estável, entrada disponível e parcela mensal de até 15% da renda, preferencialmente com histórico positivo de pagamentos. A classificação é apenas uma referência interna e não garante o pagamento.'
where ideal_client_profile is null
   or btrim(ideal_client_profile) = ''
   or ideal_client_profile like 'Demanda compatível com as áreas de atuação%';

comment on column public.organization_settings.ideal_client_profile is
  'Critérios financeiros internos para orientar o risco de inadimplência, sem decisão automática.';
