-- Run once after migrations 001-004. Only the owner's existing account manages credentials.
begin;
create schema if not exists fiesta_private;
revoke all on schema fiesta_private from public, anon, authenticated;
create table fiesta_private.account_managers (user_id uuid primary key references auth.users(id) on delete cascade);
insert into fiesta_private.account_managers values ('b9168623-38f2-49a4-b835-6fe51ea0d098');
create table fiesta_private.session_cutoffs (user_id uuid primary key references auth.users(id) on delete cascade, changed_at timestamptz not null);
create table fiesta_private.account_attempts (user_id uuid primary key references auth.users(id) on delete cascade, window_start timestamptz not null, attempts integer not null);
revoke all on all tables in schema fiesta_private from public, anon, authenticated;

create function fiesta_private.valid_session(p_user uuid, p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.sessions s where s.id = p_session and s.user_id = p_user
    and s.created_at > coalesce((select changed_at from fiesta_private.session_cutoffs where user_id = p_user), '-infinity'::timestamptz));
$$;
revoke all on function fiesta_private.valid_session(uuid, uuid) from public, anon, authenticated;

create function public.fiesta_session_valid() returns boolean
language sql stable security definer set search_path = '' as $$
  select fiesta_private.valid_session(auth.uid(), (auth.jwt()->>'session_id')::uuid);
$$;
revoke all on function public.fiesta_session_valid() from public, anon;
grant execute on function public.fiesta_session_valid() to authenticated;

create function public.fiesta_manager_access(p_user uuid, p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select fiesta_private.valid_session(p_user, p_session)
    and exists (select 1 from fiesta_private.account_managers where user_id = p_user)
    and exists (select 1 from public.market_editors where user_id = p_user);
$$;
revoke all on function public.fiesta_manager_access(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fiesta_manager_access(uuid, uuid) to service_role;

create function public.fiesta_can_manage_accounts() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.fiesta_manager_access(auth.uid(), (auth.jwt()->>'session_id')::uuid);
$$;
revoke all on function public.fiesta_can_manage_accounts() from public, anon;
grant execute on function public.fiesta_can_manage_accounts() to authenticated;

create function public.fiesta_account_attempt(p_user uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare count_now integer;
begin
  insert into fiesta_private.account_attempts values (p_user, clock_timestamp(), 1)
  on conflict (user_id) do update set
    attempts = case when fiesta_private.account_attempts.window_start < clock_timestamp() - interval '15 minutes' then 1 else fiesta_private.account_attempts.attempts + 1 end,
    window_start = case when fiesta_private.account_attempts.window_start < clock_timestamp() - interval '15 minutes' then clock_timestamp() else fiesta_private.account_attempts.window_start end
  returning attempts into count_now;
  return count_now <= 5;
end;
$$;
revoke all on function public.fiesta_account_attempt(uuid) from public, anon, authenticated;
grant execute on function public.fiesta_account_attempt(uuid) to service_role;

create function public.fiesta_invalidate_sessions(p_target uuid) returns void
language sql security definer set search_path = '' as $$
  insert into fiesta_private.session_cutoffs values (p_target, clock_timestamp())
  on conflict (user_id) do update set changed_at = excluded.changed_at;
$$;
revoke all on function public.fiesta_invalidate_sessions(uuid) from public, anon, authenticated;
grant execute on function public.fiesta_invalidate_sessions(uuid) to service_role;

-- Old access tokens and refreshes of old sessions cannot edit after a credential change.
-- Public read access remains unchanged; existing editor policies still apply.
create policy "Require current editor session" on public.market_editors as restrictive for all to authenticated
  using (public.fiesta_session_valid()) with check (public.fiesta_session_valid());
create policy "Require current market session" on public.markets as restrictive for all to authenticated
  using (public.fiesta_session_valid()) with check (public.fiesta_session_valid());
create policy "Require current content session" on public.site_sections as restrictive for all to authenticated
  using (public.fiesta_session_valid()) with check (public.fiesta_session_valid());
create policy "Require current site upload session" on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'site-images' or public.fiesta_session_valid())
  with check (bucket_id <> 'site-images' or public.fiesta_session_valid());
commit;
