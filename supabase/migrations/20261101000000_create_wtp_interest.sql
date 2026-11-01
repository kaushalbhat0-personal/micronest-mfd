-- MFD-78: Public validation + willingness-to-pay research table.
--
-- wtp_interest stores one row per feedback submission (NOT one row per
-- user): repeat submissions are preserved as separate research signals,
-- so there is no unique constraint on user_id and no upsert rule.
--
-- Ownership is enforced by RLS, never by application code:
-- - Only INSERT is granted to anon + authenticated roles. There is no
--   SELECT/UPDATE/DELETE policy, so public clients can never read back,
--   modify, or enumerate other submissions. Research reads happen via
--   privileged server tooling outside the browser.
-- - user_id is derived server-side from the session (auth.uid()); the
--   browser never supplies it. Anonymous submissions store NULL.
-- - email/message are optional free text bounded by CHECKs; exact money
--   is stored as integer minor units + ISO currency, never converted.

create table wtp_interest (
  id uuid primary key default gen_random_uuid(),

  user_id uuid null references auth.users(id) on delete set null,

  email text null
    check (email is null or (char_length(email) between 3 and 254)),

  country text not null
    check (char_length(country) between 2 and 64),

  profession text not null
    check (char_length(profession) between 1 and 48),

  profession_other text null
    check (profession_other is null or char_length(profession_other) <= 120),

  client_count_band text not null
    check (client_count_band in ('1-10', '11-25', '26-50', '51-100', '101-250', '251-500', '500+')),

  current_solution text[] not null default '{}'
    check (array_length(current_solution, 1) is null or array_length(current_solution, 1) <= 12),

  current_solution_other text null
    check (current_solution_other is null or char_length(current_solution_other) <= 120),

  desired_features text[] not null default '{}'
    check (array_length(desired_features, 1) is null or array_length(desired_features, 1) <= 16),

  other_feature text null
    check (other_feature is null or char_length(other_feature) <= 200),

  quoted_price_minor bigint null
    check (quoted_price_minor is null or (quoted_price_minor >= 0 and quoted_price_minor <= 100000000000)),

  quoted_currency text null
    check (quoted_currency is null or quoted_currency ~ '^[A-Z]{3}$'),

  price_band text not null
    check (price_band in ('free', 'under-5', '5-10', '10-25', '25-50', '50-plus', 'not-sure')),

  message text null
    check (message is null or char_length(message) <= 1000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Exact amounts are only meaningful with a real currency, and a "free"
  -- band must never carry an amount.
  check (
    (quoted_price_minor is null and quoted_currency is null)
    or (quoted_price_minor is not null and quoted_currency is not null)
  ),
  check (
    (price_band not in ('free', 'not-sure'))
    or (quoted_price_minor is null and quoted_currency is null)
  )
);

create index wtp_interest_created_at_idx
  on wtp_interest(created_at desc);

alter table wtp_interest enable row level security;

-- Public insert-only path for the research form. The WITH CHECK accepts
-- NULL user_id (anonymous) or the caller's own id (authenticated);
-- anything else — including another user's id — is rejected at the
-- database layer. No SELECT/UPDATE/DELETE policies: reads stay
-- privileged and out of the browser.
create policy wtp_interest_public_insert
  on wtp_interest for insert
  to anon, authenticated
  with check (
    user_id is null
    or user_id = auth.uid()
  );
