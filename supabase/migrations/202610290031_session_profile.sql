-- A locally verified access token is not itself proof that its Auth session
-- still exists. Return the current own profile and check session revocation in
-- one DB round trip, without exposing auth.sessions to application roles.
create function public.session_profile() returns setof public.users
language plpgsql security definer set search_path='' as $$
declare sid text:=auth.jwt()->>'session_id';begin
 if auth.uid() is null or sid is null or sid !~ '^[a-f0-9-]{36}$' or not exists(
  select 1 from auth.sessions s join auth.users u on u.id=s.user_id
  where s.id::text=sid and s.user_id=auth.uid()
   and (s.not_after is null or s.not_after>clock_timestamp())
   and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())
 ) then raise exception 'SESSION_REVOKED' using errcode='28000';end if;
 return query select u.* from public.users u where u.id=auth.uid();
end;$$;
revoke all on function public.session_profile() from public,anon,service_role;
grant execute on function public.session_profile() to authenticated;
