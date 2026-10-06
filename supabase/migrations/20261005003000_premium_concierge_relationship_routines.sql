-- Premium concierge relationship routines
-- Mirrors the production migration applied on 2026-10-05.
-- Customer-facing identity: Helena | Concierge Jurídica.
-- Relationship safeguards: use existing context before asking, silent internal routing,
-- post-filing care at 7/30 days, birthday greeting, and stagnant-process care with
-- recent-contact and service-restriction suppression.
--
-- Canonical SQL is tracked in Supabase migration history under:
-- premium_concierge_relationship_routines
select 1;
