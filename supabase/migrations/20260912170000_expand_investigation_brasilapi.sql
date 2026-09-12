insert into public.investigation_catalog
(slug, title, description, category, input_kind, provider_mode, novelty, sort_order)
values
('cep-address', 'CEP e endereço', 'Consulta pública de endereço e localização por CEP.', 'Localização', 'freeform', 'public_cep', true, 181),

('bank-data', 'Instituição bancária', 'Identificação pública de instituição bancária por código, ISPB ou nome.', 'Financeiro', 'freeform', 'public_bank', true, 182),

('pix-participants', 'Participantes do PIX', 'Consulta pública de instituições participantes do PIX.', 'Financeiro', 'freeform', 'public_pix', true, 183),

('cvm-broker', 'Corretora / CVM', 'Dados públicos de corretoras e instituições cadastradas na CVM.', 'Financeiro', 'cnpj', 'public_cvm', true, 184),

('ncm-data', 'NCM / Mercadoria', 'Consulta pública de classificação NCM por código ou descrição.', 'Empresa', 'freeform', 'public_ncm', true, 185),

('registrobr-domain', 'Domínio .br', 'Consulta pública de disponibilidade e informações de domínio .br.', 'Digital', 'freeform', 'public_registrobr', true, 186)

on conflict (slug) do update set
title = excluded.title,
description = excluded.description,
category = excluded.category,
input_kind = excluded.input_kind,
provider_mode = excluded.provider_mode,
enabled = true,
novelty = excluded.novelty,
sort_order = excluded.sort_order,
updated_at = now();