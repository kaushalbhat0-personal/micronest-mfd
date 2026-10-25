-- RCCF-MFD-22: Follow-up ownership default (C1).
--
-- The application repository never accepts user_id from callers (and never
-- fabricates one client-side): ownership is derived from the authenticated
-- session. This default fills user_id from auth.uid() at insert time, so
-- the RLS WITH CHECK (auth.uid() = user_id) passes for legitimate writes
-- while cross-user inserts are still rejected. Explicit values (tests,
-- admin tooling) continue to work — the default only applies when the
-- column is omitted.
--
-- Scope is deliberately limited to client_followups. radar_clients has the
-- same latent shape and is left untouched per C1 scope; see findings.

alter table client_followups
  alter column user_id set default auth.uid();
