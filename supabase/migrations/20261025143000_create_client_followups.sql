-- RCCF-MFD-21: Follow-up persistence foundation (C0).
--
-- client_followups holds explicit dated tasks against radar_clients.
-- No derived status, no duplicated client fields, no soft-delete:
-- status (overdue/today/upcoming) derives from due_date + completed_at,
-- and deleting a client cascades its follow-ups (they have no independent
-- CRM value). Tenant isolation is enforced by RLS (auth.uid() = user_id)
-- plus a client-ownership check on write, never by application code.

create table client_followups (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users(id) on delete cascade,

  client_id uuid not null references radar_clients(id) on delete cascade,

  due_date date not null,

  reason text not null default ''
    check (char_length(reason) between 1 and 40),

  note text not null default ''
    check (char_length(note) <= 200),

  completed_at timestamptz null,

  created_at timestamptz not null default now()
);

create index client_followups_user_open_idx
  on client_followups(user_id, due_date)
  where completed_at is null;

create index client_followups_client_open_idx
  on client_followups(client_id, due_date)
  where completed_at is null;

alter table client_followups enable row level security;

-- Owner-only read.
create policy client_followups_owner_select
  on client_followups for select
  using (auth.uid() = user_id);

-- Owner-only insert; the follow-up must target a client the caller owns.
-- Blocks own user_id + foreign client_id at the database layer.
create policy client_followups_owner_insert
  on client_followups for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from radar_clients c
      where c.id = client_followups.client_id
        and c.user_id = auth.uid()
    )
  );

-- Owner-only update; the follow-up must stay on a client the caller owns
-- before AND after (blocks reparenting onto another user's client).
create policy client_followups_owner_update
  on client_followups for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from radar_clients c
      where c.id = client_followups.client_id
        and c.user_id = auth.uid()
    )
  );

-- Owner-only delete. V1 exposes no follow-up delete in the UI; the table
-- is still secured correctly at the database layer.
create policy client_followups_owner_delete
  on client_followups for delete
  using (auth.uid() = user_id);
