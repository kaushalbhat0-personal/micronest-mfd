-- MFD-27 resolution (verified live 2026-10-31): radar_clients rows
-- created through the application never supply user_id (ownership is
-- derived from the session by RLS design), but the column had no
-- DEFAULT, so every app-driven insert failed NOT NULL / RLS WITH CHECK
-- and no client could ever be added. Mirrors the established
-- 20251025160000_followups_user_id_default for client_followups.
-- No backfill needed: user_id is NOT NULL, so no null rows can exist.
-- (Live radar_clients.is_new_client already defaults to false as the
-- base migration declares; verified, not touched here.)
alter table radar_clients alter column user_id set default auth.uid();
