-- Extend existing verified image lifecycle to non-patient manufacturer labels.
create function app_private.file_actor_access(p_actor uuid,p_file uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.stored_files f join public.users u on u.tenant_id=f.tenant_id and u.id=p_actor and u.active
 where f.id=p_file and ((f.kind='client_photo' and app_private.file_actor_allowed(p_actor,f.client_id)) or
 (f.kind='pigment_label' and (u.role='owner' or u.clinical_access))));
$$;
revoke all on function app_private.file_actor_access(uuid,uuid) from public,anon,authenticated;
create function app_private.current_file_access(p_file uuid) returns boolean
language sql stable security definer set search_path='' as $$ select app_private.file_actor_access(auth.uid(),p_file); $$;
revoke all on function app_private.current_file_access(uuid) from public,anon;
grant execute on function app_private.current_file_access(uuid) to authenticated;
alter policy files_metadata_read on public.stored_files using(app_private.current_file_access(id) and (state='ready' or created_by=auth.uid()));
create or replace function app_private.file_upload_allowed(p_name text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare f public.stored_files;
begin
 select * into f from public.stored_files where upload_path=p_name and created_by=auth.uid() for share;
 return found and f.state='pending' and f.expires_at>now() and app_private.file_actor_access(auth.uid(),f.id);
end;
$$;

create function public.prepare_pigment_label(p_pigment_id uuid,p_request_id uuid,p_size integer,p_sha256 text,p_mime text)
returns public.stored_files language plpgsql security definer set search_path='' as $$
declare tenant uuid:=app_private.current_tenant_id(); result public.stored_files; file_id uuid:=gen_random_uuid();
begin
 if not app_private.is_owner() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.tenants where id=tenant for update;
 if p_request_id is null or p_size is null or p_size not between 1 and 10485760 or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_mime is null or p_mime not in('image/jpeg','image/png','image/webp') then raise exception 'INVALID_FILE' using errcode='22023'; end if;
 select * into result from public.stored_files where created_by=auth.uid() and request_id=p_request_id;
 if found then
  if result.kind<>'pigment_label' or result.pigment_id is distinct from p_pigment_id or result.expected_size is distinct from p_size or result.expected_sha256 is distinct from p_sha256 or result.mime_type is distinct from p_mime then raise exception 'IDEMPOTENCY_MISMATCH' using errcode='23505'; end if;
  return result;
 end if;
 if not exists(select 1 from public.pigments where id=p_pigment_id and tenant_id=tenant and active) then raise exception 'INVALID_REFERENCE' using errcode='22023'; end if;
 if (select count(*) from public.stored_files where tenant_id=tenant and created_at>now()-interval '1 hour')>=100 or
 (select coalesce(sum(expected_size),0) from public.stored_files where tenant_id=tenant and created_at>now()-interval '1 hour')+p_size>209715200 then raise exception 'UPLOAD_RATE_LIMIT' using errcode='54000'; end if;
 insert into public.stored_files(id,tenant_id,pigment_id,kind,created_by,request_id,upload_path,object_path,expected_size,expected_sha256,mime_type)
 values(file_id,tenant,p_pigment_id,'pigment_label',auth.uid(),p_request_id,tenant::text||'/'||file_id::text||'/upload',tenant::text||'/'||file_id::text||'/image',p_size,p_sha256,p_mime) returning * into result;
 return result;
end;
$$;
revoke all on function public.prepare_pigment_label(uuid,uuid,integer,text,text) from public,anon;
grant execute on function public.prepare_pigment_label(uuid,uuid,integer,text,text) to authenticated;

create or replace function public.file_for_completion(p_id uuid) returns public.stored_files
language plpgsql security definer set search_path='' as $$
declare f public.stored_files;
begin
 select * into f from public.stored_files where id=p_id and created_by=auth.uid();
 if not found or not app_private.file_actor_access(auth.uid(),f.id) then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 if f.state<>'ready' and (f.state<>'pending' or f.expires_at<=now()) then raise exception 'FILE_EXPIRED' using errcode='22023'; end if;
 return f;
end;
$$;

create or replace function public.reject_client_file(p_id uuid,p_actor uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_reason is null or p_reason not in ('invalid_image','content_mismatch') then raise exception 'INVALID_FILE' using errcode='22023'; end if;
 update public.stored_files set state='failed',failure_code=p_reason,expires_at=now()
 where id=p_id and created_by=p_actor and state='pending' and app_private.file_actor_access(p_actor,id);
end;
$$;

create or replace function public.cancel_client_file(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare f public.stored_files;
begin
 select * into f from public.stored_files where id=p_id and created_by=auth.uid() for update;
 if not found or not app_private.file_actor_access(auth.uid(),f.id) then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 if f.state='ready' then raise exception 'FILE_ALREADY_READY' using errcode='22023'; end if;
 update public.stored_files set state='failed',failure_code='cancelled',expires_at=now() where id=f.id and state='pending';
end;
$$;

create or replace function public.authorize_file_read(p_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare f public.stored_files;
begin
 select * into f from public.stored_files where id=p_id and state='ready';
 if not found or not app_private.file_actor_access(auth.uid(),f.id) then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 perform 1 from public.tenants where id=f.tenant_id for update;
 if (select count(*) from public.audit_log where actor_id=auth.uid() and action='file.read' and created_at>now()-interval '1 minute')>=60 then raise exception 'FILE_READ_RATE_LIMIT' using errcode='54000'; end if;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(f.tenant_id,auth.uid(),'file.read','stored_files',f.id);
 return f.object_path;
end;
$$;

create or replace function public.finish_client_file(p_id uuid,p_actor uuid,p_sha256 text,p_size integer,p_width integer,p_height integer)
returns public.stored_files language plpgsql security definer set search_path='' as $$
declare f public.stored_files;
begin
 select * into f from public.stored_files where id=p_id for update;
 if not found or f.created_by is distinct from p_actor or not app_private.file_actor_access(p_actor,f.id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if f.state='ready' then return f; end if;
 if f.state<>'pending' or f.expires_at<=now() then raise exception 'FILE_EXPIRED' using errcode='22023'; end if;
 if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_size is null or p_size not between 1 and 10485760 or p_width is null or p_height is null or p_width<=0 or p_height<=0 or p_width::bigint*p_height>20000000 then raise exception 'INVALID_FILE' using errcode='22023'; end if;
 if not exists(select 1 from storage.objects where bucket_id=f.bucket and name=f.object_path) then raise exception 'FILE_NOT_UPLOADED' using errcode='22023'; end if;
 update public.stored_files set state='ready',sha256=p_sha256,size_bytes=p_size,width=p_width,height=p_height,ready_at=now() where id=f.id returning * into f;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(f.tenant_id,p_actor,'file.ready','stored_files',f.id);
 return f;
end;
$$;
