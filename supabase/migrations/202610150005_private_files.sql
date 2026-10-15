-- Private file lifecycle. Original uploads never become readable; the server
-- verifies and normalizes images into an immutable object before finalization.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('glow-private','glow-private',false,10485760,array['image/jpeg','image/png','image/webp']);

create table public.stored_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  client_id uuid not null,
  appointment_id uuid,
  created_by uuid not null,
  request_id uuid not null,
  kind text not null default 'client_photo' check(kind='client_photo'),
  state text not null default 'pending' check(state in ('pending','ready','failed','discarded')),
  bucket text not null default 'glow-private' check(bucket='glow-private'),
  upload_path text not null unique,
  object_path text not null unique,
  expected_size integer not null check(expected_size between 1 and 10485760),
  expected_sha256 text not null check(expected_sha256 ~ '^[a-f0-9]{64}$'),
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes integer check(size_bytes between 1 and 10485760),
  sha256 text check(sha256 ~ '^[a-f0-9]{64}$'),
  width integer check(width>0), height integer check(height>0),
  failure_code text check(failure_code in ('invalid_image','content_mismatch','cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '1 hour',
  ready_at timestamptz,
  staging_cleaned_at timestamptz,
  cleanup_completed_at timestamptz,
  cleanup_token uuid,
  cleanup_lease_until timestamptz,
  unique(tenant_id,id), unique(created_by,request_id),
  foreign key(tenant_id,client_id) references public.clients(tenant_id,id),
  foreign key(tenant_id,appointment_id) references public.appointments(tenant_id,id),
  foreign key(tenant_id,created_by) references public.users(tenant_id,id),
  check(upload_path=tenant_id::text||'/'||id::text||'/upload'),
  check(object_path=tenant_id::text||'/'||id::text||'/image'),
  check(state<>'ready' or (ready_at is not null and sha256 is not null and size_bytes is not null and width is not null and height is not null))
);
create index stored_files_client on public.stored_files(tenant_id,client_id,created_at desc);
create index stored_files_rate on public.stored_files(tenant_id,created_at);
create index stored_files_cleanup on public.stored_files(expires_at) where cleanup_completed_at is null;
alter table public.stored_files enable row level security;
create policy files_metadata_read on public.stored_files for select to authenticated
using (public.can_access_client_clinical(client_id) and (state='ready' or created_by=auth.uid()));
revoke all on public.stored_files from public,anon,authenticated;
grant select on public.stored_files to authenticated;
create trigger audit_files after insert or update on public.stored_files for each row execute function app_private.audit_mutation();

create function app_private.file_actor_allowed(p_actor uuid,p_client uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.users u join public.clients c on c.tenant_id=u.tenant_id
 where u.id=p_actor and u.active and c.id=p_client and (u.role='owner' or (u.clinical_access and exists(
 select 1 from public.client_assignments a where a.tenant_id=u.tenant_id and a.client_id=c.id and a.operator_id=u.id and a.active))));
$$;
revoke all on function app_private.file_actor_allowed(uuid,uuid) from public,anon,authenticated;

create function public.prepare_client_file(p_client_id uuid,p_request_id uuid,p_size integer,p_sha256 text,p_mime text,p_appointment_id uuid default null)
returns public.stored_files language plpgsql security definer set search_path='' as $$
declare profile public.users; result public.stored_files; file_id uuid:=gen_random_uuid();
begin
 select * into profile from public.users where id=auth.uid() and active;
 if not found or not app_private.file_actor_allowed(auth.uid(),p_client_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.tenants where id=profile.tenant_id for update;
 if p_request_id is null or p_size is null or p_size not between 1 and 10485760 or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_mime is null or p_mime not in ('image/jpeg','image/png','image/webp') then
 raise exception 'INVALID_FILE' using errcode='22023'; end if;
 select * into result from public.stored_files where created_by=auth.uid() and request_id=p_request_id;
 if found then
  if result.client_id is distinct from p_client_id or result.appointment_id is distinct from p_appointment_id or result.expected_size is distinct from p_size or result.expected_sha256 is distinct from p_sha256 or result.mime_type is distinct from p_mime then raise exception 'IDEMPOTENCY_MISMATCH' using errcode='23505'; end if;
  return result;
 end if;
 if not exists(select 1 from public.clients where id=p_client_id and tenant_id=profile.tenant_id and archived_at is null) then raise exception 'INVALID_REFERENCE' using errcode='22023'; end if;
 if p_appointment_id is not null and not exists(select 1 from public.appointments where id=p_appointment_id and tenant_id=profile.tenant_id and client_id=p_client_id) then raise exception 'INVALID_REFERENCE' using errcode='22023'; end if;
 if (select count(*) from public.stored_files where tenant_id=profile.tenant_id and created_at>now()-interval '1 hour')>=100 or
 (select coalesce(sum(expected_size),0) from public.stored_files where tenant_id=profile.tenant_id and created_at>now()-interval '1 hour')+p_size>209715200 then
 raise exception 'UPLOAD_RATE_LIMIT' using errcode='54000'; end if;
 insert into public.stored_files(id,tenant_id,client_id,appointment_id,created_by,request_id,upload_path,object_path,expected_size,expected_sha256,mime_type)
 values(file_id,profile.tenant_id,p_client_id,p_appointment_id,auth.uid(),p_request_id,profile.tenant_id::text||'/'||file_id::text||'/upload',profile.tenant_id::text||'/'||file_id::text||'/image',p_size,p_sha256,p_mime) returning * into result;
 return result;
end;
$$;

-- Hold the metadata lock until Storage commits its INSERT. Cleanup must wait for
-- uploads already in flight before marking a record discarded and deleting it.
create function app_private.file_upload_allowed(p_name text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare f public.stored_files;
begin
 select * into f from public.stored_files where upload_path=p_name for share;
 return found and f.state='pending' and f.expires_at>now() and f.created_by=auth.uid() and app_private.file_actor_allowed(auth.uid(),f.client_id);
end;
$$;
revoke all on function app_private.file_upload_allowed(text) from public,anon;
grant execute on function app_private.file_upload_allowed(text) to authenticated;
create policy glow_private_upload on storage.objects for insert to authenticated
 with check(bucket_id='glow-private' and app_private.file_upload_allowed(name));
-- No authenticated SELECT, UPDATE or DELETE policy: no list/download/signing,
-- replacement, or ready-object insertion through the public Storage API.

create function public.file_for_completion(p_id uuid) returns public.stored_files
language plpgsql security definer set search_path='' as $$
declare f public.stored_files;
begin
 select * into f from public.stored_files where id=p_id and created_by=auth.uid();
 if not found or not app_private.file_actor_allowed(auth.uid(),f.client_id) then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 if f.state<>'ready' and (f.state<>'pending' or f.expires_at<=now()) then raise exception 'FILE_EXPIRED' using errcode='22023'; end if;
 return f;
end;
$$;

create function public.finish_client_file(p_id uuid,p_actor uuid,p_sha256 text,p_size integer,p_width integer,p_height integer)
returns public.stored_files language plpgsql security definer set search_path='' as $$
declare f public.stored_files;
begin
 select * into f from public.stored_files where id=p_id for update;
 if not found or f.created_by is distinct from p_actor or not app_private.file_actor_allowed(p_actor,f.client_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if f.state='ready' then return f; end if;
 if f.state<>'pending' or f.expires_at<=now() then raise exception 'FILE_EXPIRED' using errcode='22023'; end if;
 if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_size is null or p_size not between 1 and 10485760 or p_width is null or p_height is null or p_width<=0 or p_height<=0 or p_width::bigint*p_height>20000000 then raise exception 'INVALID_FILE' using errcode='22023'; end if;
 if not exists(select 1 from storage.objects where bucket_id=f.bucket and name=f.object_path) then raise exception 'FILE_NOT_UPLOADED' using errcode='22023'; end if;
 update public.stored_files set state='ready',sha256=p_sha256,size_bytes=p_size,width=p_width,height=p_height,ready_at=now() where id=f.id returning * into f;
 return f;
end;
$$;

create function public.reject_client_file(p_id uuid,p_actor uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_reason is null or p_reason not in ('invalid_image','content_mismatch') then raise exception 'INVALID_FILE' using errcode='22023'; end if;
 update public.stored_files set state='failed',failure_code=p_reason,expires_at=now()
 where id=p_id and created_by=p_actor and state='pending' and app_private.file_actor_allowed(p_actor,client_id);
end;
$$;

create function public.cancel_client_file(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare f public.stored_files;
begin
 select * into f from public.stored_files where id=p_id and created_by=auth.uid() for update;
 if not found or not app_private.file_actor_allowed(auth.uid(),f.client_id) then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 if f.state='ready' then raise exception 'FILE_ALREADY_READY' using errcode='22023'; end if;
 update public.stored_files set state='failed',failure_code='cancelled',expires_at=now() where id=f.id and state='pending';
end;
$$;

create function public.authorize_file_read(p_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare f public.stored_files;
begin
 select * into f from public.stored_files where id=p_id and state='ready';
 if not found or not app_private.file_actor_allowed(auth.uid(),f.client_id) then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 perform 1 from public.tenants where id=f.tenant_id for update;
 if (select count(*) from public.audit_log where actor_id=auth.uid() and action='file.read' and created_at>now()-interval '1 minute')>=60 then raise exception 'FILE_READ_RATE_LIMIT' using errcode='54000'; end if;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(f.tenant_id,auth.uid(),'file.read','stored_files',f.id);
 return f.object_path;
end;
$$;

create function public.claim_file_cleanup(p_limit integer default 50) returns setof jsonb
language plpgsql security definer set search_path='' as $$
declare f public.stored_files; token uuid;
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_LIMIT' using errcode='22023'; end if;
 for f in select * from public.stored_files where (cleanup_lease_until is null or cleanup_lease_until<now()) and
 ((state='ready' and staging_cleaned_at is null) or (state in ('failed','discarded') and cleanup_completed_at is null) or (state='pending' and expires_at<=now()))
 order by created_at for update skip locked limit p_limit loop
  token:=gen_random_uuid();
  update public.stored_files set state=case when f.state='ready' then 'ready' else 'discarded' end,cleanup_token=token,cleanup_lease_until=now()+interval '5 minutes' where id=f.id;
  return next jsonb_build_object('id',f.id,'claim',token,'bucket',f.bucket,'paths',case when f.state='ready' then jsonb_build_array(f.upload_path) else jsonb_build_array(f.upload_path,f.object_path) end);
 end loop;
end;
$$;
create function public.complete_file_cleanup(p_id uuid,p_claim uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.stored_files set staging_cleaned_at=now(),cleanup_completed_at=case when state='discarded' then now() else cleanup_completed_at end,cleanup_token=null,cleanup_lease_until=null
 where id=p_id and cleanup_token=p_claim and cleanup_lease_until>now();
 if not found then raise exception 'STALE_CLEANUP_CLAIM' using errcode='40001'; end if;
end;
$$;

revoke all on function public.prepare_client_file(uuid,uuid,integer,text,text,uuid),public.file_for_completion(uuid),public.cancel_client_file(uuid),public.authorize_file_read(uuid) from public,anon;
grant execute on function public.prepare_client_file(uuid,uuid,integer,text,text,uuid),public.file_for_completion(uuid),public.cancel_client_file(uuid),public.authorize_file_read(uuid) to authenticated;
revoke all on function public.finish_client_file(uuid,uuid,text,integer,integer,integer),public.reject_client_file(uuid,uuid,text),public.claim_file_cleanup(integer),public.complete_file_cleanup(uuid,uuid) from public,anon,authenticated;
grant execute on function public.finish_client_file(uuid,uuid,text,integer,integer,integer),public.reject_client_file(uuid,uuid,text),public.claim_file_cleanup(integer),public.complete_file_cleanup(uuid,uuid) to service_role;
