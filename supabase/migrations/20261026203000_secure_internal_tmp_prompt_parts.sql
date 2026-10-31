-- Restrict an internal staging table that had public/anon/authenticated access.
-- Preserve existing rows and service_role access. Applied to production Supabase on 2026-10-26.
REVOKE ALL PRIVILEGES ON TABLE public._tmp_prompt_parts FROM PUBLIC, anon, authenticated;
ALTER TABLE public._tmp_prompt_parts ENABLE ROW LEVEL SECURITY;
