-- MFD-65: separate SIP and Lumpsum relationship-context amounts.
--
-- Adds sip_amount_paise and lumpsum_amount_paise (integer paise, nullable,
-- non-negative, same ₹100 crore ceiling as the legacy field). Both may be
-- set independently for Investment Type = Both.
--
-- amount_paise is PRESERVED as a backwards-compatible mirror (populated by
-- application code from the two new columns). Existing rows are backfilled
-- deterministically from amount_paise:
--   SIP       -> sip_amount_paise (monthly SIP reading, unchanged semantics)
--   Both      -> sip_amount_paise (legacy single amount always read as the
--              monthly SIP figure; never duplicated into lumpsum)
--   Lumpsum   -> lumpsum_amount_paise
--   Insurance / Other -> lumpsum_amount_paise (plain associated amount)
-- RLS policies are untouched; ownership stays auth.uid() = user_id.

alter table radar_clients
  add column if not exists sip_amount_paise bigint null;

alter table radar_clients
  add column if not exists lumpsum_amount_paise bigint null;

alter table radar_clients
  drop constraint if exists radar_clients_sip_amount_paise_nonnegative;

alter table radar_clients
  add constraint radar_clients_sip_amount_paise_nonnegative
  check (sip_amount_paise is null or sip_amount_paise >= 0);

alter table radar_clients
  drop constraint if exists radar_clients_lumpsum_amount_paise_nonnegative;

alter table radar_clients
  add constraint radar_clients_lumpsum_amount_paise_nonnegative
  check (lumpsum_amount_paise is null or lumpsum_amount_paise >= 0);

-- Deterministic backfill from the legacy single amount. Runs once; new
-- writes maintain both the new columns and the legacy mirror.
update radar_clients
  set sip_amount_paise = amount_paise
  where sip_amount_paise is null
    and amount_paise is not null
    and investment_type in ('SIP', 'Both');

update radar_clients
  set lumpsum_amount_paise = amount_paise
  where lumpsum_amount_paise is null
    and amount_paise is not null
    and investment_type in ('Lumpsum', 'Insurance', 'Other');
