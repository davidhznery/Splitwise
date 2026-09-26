-- Create this table in Supabase SQL Editor. The browser never accesses it directly;
-- all reads and writes go through the Vercel API using the server-only service key.
create table if not exists public.shared_balances (
  id text primary key,
  state jsonb not null,
  archives jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.shared_balances enable row level security;
revoke all on public.shared_balances from anon, authenticated;
grant all on public.shared_balances to service_role;
