-- Only the authenticated server function may check a verified editor/session pair.
begin;
create or replace function public.fiesta_editor_access(p_user uuid, p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select fiesta_private.valid_session(p_user, p_session)
    and exists (select 1 from public.market_editors where user_id = p_user);
$$;
revoke all on function public.fiesta_editor_access(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fiesta_editor_access(uuid, uuid) to service_role;
commit;
