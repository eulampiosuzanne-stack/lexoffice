update public.investigation_catalog
set provider_mode = 'public_ddd',
    description = 'Enriquecimento público do telefone por DDD, com UF e cidades atendidas. Não identifica titular da linha.',
    updated_at = now()
where slug = 'phone-data';
