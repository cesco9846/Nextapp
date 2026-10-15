-- Restrict uploads to the session-bound upload operation. Signed upload tokens
-- bypass later RLS checks and may outlive revocation/cleanup; never mint them.
-- Helper is provided by the current Supabase Storage schema (verified local/remote).
alter policy glow_private_upload on storage.objects with check (
 bucket_id='glow-private' and storage.allow_only_operation('object.upload')
 and app_private.file_upload_allowed(name)
);

create or replace function app_private.file_upload_allowed(p_name text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare f public.stored_files;
begin
 select * into f from public.stored_files where upload_path=p_name and created_by=auth.uid() for share;
 return found and f.state='pending' and f.expires_at>now() and app_private.file_actor_allowed(auth.uid(),f.client_id);
end;
$$;

-- Trusted finalization preserves the initiating actor in the audit trail.
create or replace function public.finish_client_file(p_id uuid,p_actor uuid,p_sha256 text,p_size integer,p_width integer,p_height integer)
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
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(f.tenant_id,p_actor,'file.ready','stored_files',f.id);
 return f;
end;
$$;
