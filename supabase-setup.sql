-- Insulator workshop tracker: shared live database.
-- Paste all of this into Supabase → SQL Editor → New query → Run (once).

create table if not exists public.records (
  kind text not null,          -- job | task | worker | user | film | meta
  id text not null,
  data jsonb not null,
  pos integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);

-- only devices linked with the workshop account can read or write
alter table public.records enable row level security;
drop policy if exists "linked devices" on public.records;
create policy "linked devices" on public.records
  for all to authenticated using (true) with check (true);

-- live updates to every open device
alter publication supabase_realtime add table public.records;
