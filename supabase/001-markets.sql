-- Run once in the Supabase SQL editor for the Fiesta project.
begin;
create table public.market_editors (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.market_editors enable row level security;
revoke all on public.market_editors from anon, authenticated;
grant select on public.market_editors to authenticated;
create policy "Editors can check their own membership" on public.market_editors
  for select to authenticated using (user_id = (select auth.uid()));

create table public.markets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 150),
  address text not null check (length(trim(address)) between 1 and 300),
  postcode text not null default '' check (length(postcode) <= 20),
  description text not null default '' check (length(description) <= 2000),
  color text not null default '#fff2db' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order integer not null default 0 check (sort_order between 0 and 9999),
  schedule jsonb not null default '[]' check (jsonb_typeof(schedule) = 'array' and jsonb_array_length(schedule) <= 200),
  published boolean not null default false,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.markets enable row level security;
revoke all on public.markets from anon, authenticated;
grant select on public.markets to anon, authenticated;
grant insert, update, delete on public.markets to authenticated;
create policy "Visitors read live listings" on public.markets for select to anon, authenticated
  using (published and (expires_at is null or expires_at > now()));
create policy "Approved editors manage listings" on public.markets for all to authenticated
  using (exists (select 1 from public.market_editors where user_id = (select auth.uid())))
  with check (exists (select 1 from public.market_editors where user_id = (select auth.uid())));
create function public.market_touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = clock_timestamp(); return new; end;
$$;
create trigger market_updated before update on public.markets for each row execute function public.market_touch_updated_at();
commit;
