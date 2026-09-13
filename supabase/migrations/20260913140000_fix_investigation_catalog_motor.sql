update public.investigation_catalog
set provider_mode = 'motor',
    description = 'Histórico profissional consultado pelo motor de investigação em fontes externas autorizadas.',
    updated_at = now()
where slug = 'professional-data';

update public.investigation_catalog
set provider_mode = 'motor',
    description = 'Endereços e meios de contato consultados pelo motor de investigação em fontes externas autorizadas.',
    updated_at = now()
where slug = 'person-location';

update public.investigation_catalog
set description = 'Processos consultados em fontes processuais integradas e, quando necessário, na base sincronizada do escritório.',
    updated_at = now()
where slug = 'processes';
