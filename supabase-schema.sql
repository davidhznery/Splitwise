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

-- Public collaborators may append expenses/payments through the Vercel API.
-- The function appends atomically so concurrent additions do not overwrite
-- one another. The browser never receives the service key or calls this RPC.
create or replace function public.append_shared_entry(p_collection text, p_entry jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  updated_state jsonb;
begin
  if p_collection is null or p_collection not in ('expenses', 'payments') then
    raise exception 'Invalid shared entry collection';
  end if;
  if jsonb_typeof(p_entry) <> 'object' or p_entry->>'id' is null then
    raise exception 'Invalid shared entry';
  end if;

  update public.shared_balances as balance
  set state = jsonb_set(
    balance.state,
    array[p_collection],
    (case
      when jsonb_typeof(balance.state->p_collection) = 'array' then balance.state->p_collection
      else '[]'::jsonb
    end) || jsonb_build_array(p_entry),
    true
  ),
  updated_at = now()
  where balance.id = 'main'
    and balance.state is not null
    and not exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(balance.state->p_collection) = 'array' then balance.state->p_collection
          else '[]'::jsonb
        end
      ) as existing_entry
      where existing_entry->>'id' = p_entry->>'id'
    )
  returning balance.state into updated_state;

  if updated_state is null then
    select balance.state into updated_state
    from public.shared_balances as balance
    where balance.id = 'main';
  end if;

  if updated_state is null then
    raise exception 'Shared balance has not been initialized';
  end if;

  return updated_state;
end;
$$;

revoke all on function public.append_shared_entry(text, jsonb) from public, anon, authenticated;
grant execute on function public.append_shared_entry(text, jsonb) to service_role;
