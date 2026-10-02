alter table public.investigation_searches
  add column if not exists duration_ms integer;

alter table public.investigation_batch_items
  add column if not exists duration_ms integer;

alter table public.investigation_batches
  add column if not exists duration_ms integer;

create index if not exists investigation_searches_slug_created_idx
  on public.investigation_searches(search_slug, created_at desc);

comment on column public.investigation_searches.duration_ms is
  'Tempo total da consulta individual em milissegundos.';
comment on column public.investigation_batch_items.duration_ms is
  'Tempo total do item do lote em milissegundos.';
comment on column public.investigation_batches.duration_ms is
  'Tempo total do lote de investigação em milissegundos.';