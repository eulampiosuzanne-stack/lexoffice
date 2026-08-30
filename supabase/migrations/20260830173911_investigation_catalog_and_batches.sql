create table if not exists public.investigation_catalog (
  slug text primary key,
  title text not null,
  description text not null,
  category text not null,
  input_kind text not null default 'document_or_name',
  provider_mode text not null default 'provider_required',
  enabled boolean not null default true,
  novelty boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.investigation_catalog enable row level security;
drop policy if exists investigation_catalog_authenticated_read on public.investigation_catalog;
create policy investigation_catalog_authenticated_read on public.investigation_catalog for select to authenticated using (enabled = true);

insert into public.investigation_catalog(slug,title,description,category,input_kind,provider_mode,novelty,sort_order) values
('phone-data','Dados por telefone','Informações básicas sobre uma pessoa física a partir de um número de telefone.','Pessoa','phone','provider_required',true,10),
('financed-properties','Imóveis financiados','Identifique imóveis financiados e status das operações por CPF.','Patrimônio','cpf','provider_required',true,20),
('rural-properties','Imóveis rurais','Consulta de imóveis rurais com informações obtidas em bases oficiais autorizadas.','Patrimônio','cpf_cnpj','provider_required',true,30),
('vehicle-debts','Débitos veiculares','Consulte multas, IPVA e licenciamento pela placa.','Veículos','plate','provider_required',false,40),
('cnh-data','Dados da CNH','Consulte informações sobre a CNH para fins jurídicos autorizados.','Veículos','cpf','provider_required',false,50),
('vehicle-tracking','Rastreamento de veículo','Informações para rastrear referências de veículos por integrações autorizadas.','Veículos','plate','provider_required',false,60),
('economic-group','Grupo econômico','Relação entre empresas para identificação de possível grupo econômico.','Empresa','cnpj','public_cnpj',false,70),
('registration-status','Situação cadastral','Situação cadastral da pessoa jurídica nos registros públicos disponíveis.','Empresa','cnpj','public_cnpj',false,80),
('professional-data','Dados profissionais','Histórico profissional disponível em dados internos e fontes autorizadas.','Pessoa','name_or_cpf','internal',false,90),
('trademarks-patents','Marcas e patentes','Informações e histórico de marcas e patentes relacionadas à pessoa física ou jurídica.','Empresa','name_or_document','provider_required',false,100),
('processes','Processos','Informações de processos envolvendo a pessoa física ou jurídica.','Jurídico','name_or_document','internal',false,110),
('credit-restrictions','Restrição de crédito','Informações de crédito de pessoas físicas ou jurídicas por provedor autorizado.','Financeiro','cpf_cnpj','provider_required',false,120),
('relationships','Relacionamentos','Informações de relações familiares ou societárias disponíveis em fontes autorizadas.','Pessoa','name_or_document','provider_required',false,130),
('shareholdings','Participações societárias','Informações sobre sociedades relacionadas à pessoa física ou jurídica.','Empresa','cnpj','public_cnpj',false,140),
('company-data','Dados da empresa','Informações da pessoa jurídica, incluindo CNAEs e quadro societário.','Empresa','cnpj','public_cnpj',false,150),
('person-location','Localização de pessoa','Dados de contato e endereço existentes no cadastro interno do escritório.','Pessoa','name_or_cpf','internal',false,160),
('vehicle-ownership','Propriedade veicular','Veículos registrados em nome da pessoa física ou jurídica por provedor autorizado.','Veículos','cpf_cnpj','provider_required',false,170),
('vehicle-data','Dados do veículo','Informações completas sobre o veículo e proprietário por integração autorizada.','Veículos','plate','provider_required',false,180)
on conflict (slug) do update set title=excluded.title,description=excluded.description,category=excluded.category,input_kind=excluded.input_kind,provider_mode=excluded.provider_mode,enabled=true,novelty=excluded.novelty,sort_order=excluded.sort_order,updated_at=now();

create table if not exists public.investigation_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid null,
  query_text text not null,
  status text not null default 'processing' check (status in ('processing','completed','partial','failed')),
  total_items integer not null default 0,
  completed_items integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);
create index if not exists investigation_batches_org_created_idx on public.investigation_batches(org_id, created_at desc);
alter table public.investigation_batches enable row level security;
drop policy if exists investigation_batches_org_select on public.investigation_batches;
create policy investigation_batches_org_select on public.investigation_batches for select to authenticated using (org_id = current_org_id());

create table if not exists public.investigation_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.investigation_batches(id) on delete cascade,
  org_id uuid not null,
  search_type text not null,
  search_slug text not null,
  status text not null,
  source text null,
  result jsonb not null default '{}'::jsonb,
  error_message text null,
  created_at timestamptz not null default now()
);
create index if not exists investigation_batch_items_batch_idx on public.investigation_batch_items(batch_id);
create index if not exists investigation_batch_items_org_idx on public.investigation_batch_items(org_id, created_at desc);
alter table public.investigation_batch_items enable row level security;
drop policy if exists investigation_batch_items_org_select on public.investigation_batch_items;
create policy investigation_batch_items_org_select on public.investigation_batch_items for select to authenticated using (org_id = current_org_id());

alter table public.investigation_searches add column if not exists search_slug text;
alter table public.investigation_searches add column if not exists batch_id uuid references public.investigation_batches(id) on delete set null;
alter table public.investigation_searches add column if not exists investigation_id uuid references public.investigations(id) on delete set null;
create index if not exists investigation_searches_org_created_idx on public.investigation_searches(org_id, created_at desc);
create index if not exists investigation_searches_batch_idx on public.investigation_searches(batch_id);
create index if not exists investigation_searches_investigation_idx on public.investigation_searches(investigation_id);
