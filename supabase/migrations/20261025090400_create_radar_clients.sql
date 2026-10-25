-- RCCF-MFD-15: Client Radar database foundation.
--
-- radar_clients holds ONLY the seven approved relationship fields plus
-- identity/ownership/timestamps. No signals, no financial data, no PII
-- beyond name + mobile + note. Tenant isolation is enforced by RLS
-- (auth.uid() = user_id), never by application code.

create table radar_clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null
    check (char_length(name) between 1 and 60),

  mobile text not null default '',

  investment_type text not null default 'Other'
    check (
      investment_type in (
        'SIP',
        'Lumpsum',
        'Both',
        'Insurance',
        'Other'
      )
    ),

  last_invested date null,

  last_contacted date null,

  is_new_client boolean not null default false,

  note text not null default ''
    check (char_length(note) <= 200),

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()
);

create index radar_clients_user_id_idx
  on radar_clients(user_id);

create index radar_clients_user_updated_idx
  on radar_clients(user_id, updated_at desc);

-- Server-generated updated_at: never trust client-supplied timestamps.
create or replace function radar_clients_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger radar_clients_updated_at
  before update on radar_clients
  for each row
  execute function radar_clients_set_updated_at();

alter table radar_clients enable row level security;

-- Owner-only read.
create policy radar_clients_owner_select
  on radar_clients for select
  using (auth.uid() = user_id);

-- Owner-only insert; the inserted row must belong to the caller.
create policy radar_clients_owner_insert
  on radar_clients for insert
  with check (auth.uid() = user_id);

-- Owner-only update; the row must belong to the caller before AND after.
create policy radar_clients_owner_update
  on radar_clients for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Owner-only delete.
create policy radar_clients_owner_delete
  on radar_clients for delete
  using (auth.uid() = user_id);
