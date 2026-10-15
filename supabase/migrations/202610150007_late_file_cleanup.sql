-- A privileged image write can finish after an expired pending upload has
-- already been discarded and cleaned. Keep tombstones and reconcile actual
-- Storage metadata again, rather than treating cleanup acknowledgment as proof
-- that no in-flight write can ever commit later. Ready images are never deleted.
create index stored_files_discarded on public.stored_files(created_at) where state='discarded';
create or replace function public.claim_file_cleanup(p_limit integer default 50) returns setof jsonb
language plpgsql security definer set search_path='' as $$
declare f public.stored_files; token uuid;
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_LIMIT' using errcode='22023'; end if;
 for f in select * from public.stored_files where (cleanup_lease_until is null or cleanup_lease_until<now()) and
 ((state='ready' and staging_cleaned_at is null) or (state='failed' and cleanup_completed_at is null) or
 (state='discarded' and (cleanup_completed_at is null or exists(
   select 1 from storage.objects o where o.bucket_id=public.stored_files.bucket and o.name in(public.stored_files.upload_path,public.stored_files.object_path)
 ))) or (state='pending' and expires_at<=now()))
 order by created_at for update skip locked limit p_limit loop
  token:=gen_random_uuid();
  update public.stored_files set state=case when f.state='ready' then 'ready' else 'discarded' end,cleanup_token=token,cleanup_lease_until=now()+interval '5 minutes' where id=f.id;
  return next jsonb_build_object('id',f.id,'claim',token,'bucket',f.bucket,'paths',case when f.state='ready' then jsonb_build_array(f.upload_path) else jsonb_build_array(f.upload_path,f.object_path) end);
 end loop;
end;
$$;