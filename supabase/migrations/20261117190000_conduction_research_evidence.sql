alter table public.process_conduction_drafts add column if not exists research_evidence jsonb;
comment on column public.process_conduction_drafts.research_evidence is 'Contexto lido, pesquisa oficial, fontes e provedor da geração para revisão jurídica.';
