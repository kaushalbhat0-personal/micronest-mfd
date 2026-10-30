-- RCCF-MFD-55: optional relationship-context amount on radar_clients.
--
-- amount_paise holds an optional amount in integer paise (never
-- floating-point). SIP/Both read as monthly SIP amounts; Lumpsum as the
-- recorded lumpsum amount; Insurance/Other as an optional associated
-- amount. Relationship context only — never portfolio value, AUM,
-- holdings, returns, or profit. Nullable: existing rows stay valid and no
-- backfill is required. RLS policies are untouched; the MFD-27 user_id
-- default is preserved.

alter table radar_clients
  add column if not exists amount_paise bigint null;

alter table radar_clients
  drop constraint if exists radar_clients_amount_paise_nonnegative;

alter table radar_clients
  add constraint radar_clients_amount_paise_nonnegative
  check (amount_paise is null or amount_paise >= 0);
