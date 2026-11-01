-- P0: Super Admin membership table.
--
-- admin_users stores one row per administrator (NOT one row per user):
-- the source of truth for server-side requireAdmin() checks.
--
-- Access model:
-- - RLS enabled. Only self-read for authenticated users
--   (auth.uid() = user_id), so a non-admin self-lookup returns zero rows
--   and reveals nothing about other admins.
-- - No INSERT/UPDATE/DELETE policies: writes are privileged/manual in P0
--   (Supabase SQL editor or future gated RPC). Service-role bypasses RLS
--   only after requireAdmin() succeeds in application code.
-- - Existing RLS on radar_clients, client_followups, wtp_interest is
--   unchanged by this migration.

create table public.admin_users (
  user_id uuid primary key
    references auth.users(id)
    on delete cascade,

  role text not null default 'admin'
    check (role in ('admin')),

  created_at timestamptz not null default now(),

  created_by uuid null
    references auth.users(id)
    on delete set null,

  revoked_at timestamptz null
);

alter table public.admin_users enable row level security;

-- Self-read only. No cross-user SELECT, no INSERT/UPDATE/DELETE.
create policy admin_users_self_select
on public.admin_users
for select
to authenticated
using (auth.uid() = user_id);
