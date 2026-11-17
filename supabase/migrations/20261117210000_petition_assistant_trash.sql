-- Exclusão recuperável de análises, sem apagar clientes, processos ou documentos.
ALTER TABLE public.petition_assistant_runs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_petition_assistant_runs_active
  ON public.petition_assistant_runs (org_id, created_at DESC)
  WHERE deleted_at IS NULL;
COMMENT ON COLUMN public.petition_assistant_runs.deleted_at IS
  'Data de envio à lixeira; retenção de 30 dias antes de eventual expurgo controlado.';
