alter table public.tenants add column name_version integer not null default 1 check(name_version>0);
alter table public.services add column version integer not null default 1 check(version>0);
create function app_private.service_revision() returns trigger language plpgsql set search_path='' as $$
begin new.version:=old.version+1;return new;end;$$;
create trigger service_revision before update on public.services for each row execute function app_private.service_revision();
revoke all on function app_private.service_revision() from public,anon,authenticated,service_role;

-- Retain the temporary export tombstone after contact deletion: a delayed
-- upload may arrive after its first cleanup and must remain traceable by GC.
alter table public.privacy_exports alter column client_id drop not null;
alter table public.privacy_exports drop constraint privacy_exports_tenant_id_client_id_fkey;
alter table public.privacy_exports add foreign key(tenant_id,client_id) references public.clients(tenant_id,id) on delete set null (client_id);

-- Match scheduling/privacy lock order; membership is checked again after a wait.
create function app_private.management_owner() returns public.users
language plpgsql security definer set search_path='' as $$
declare tenant uuid:=app_private.current_tenant_id();u public.users;
begin
 perform 1 from public.tenants where id=tenant for update;
 select * into u from public.users where id=auth.uid() and tenant_id=tenant and active and role='owner';
 if not found then raise exception 'FORBIDDEN' using errcode='42501';end if;
 return u;
end;$$;
revoke all on function app_private.management_owner() from public,anon,authenticated,service_role;
create function public.rename_workspace(p_name text,p_version integer) returns public.tenants
language plpgsql security definer set search_path='' as $$
declare u public.users:=app_private.management_owner();t public.tenants;
begin
 if p_name is null or char_length(btrim(p_name)) not between 2 and 100 then raise exception 'INVALID_NAME' using errcode='22023';end if;
 select * into t from public.tenants where id=u.tenant_id;
 if t.name_version is distinct from p_version then raise exception 'STALE_VERSION' using errcode='40001';end if;
 if t.name=btrim(p_name) then return t;end if;
 update public.tenants set name=btrim(p_name),name_version=name_version+1 where id=t.id returning * into t;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(t.id,auth.uid(),'workspace.rename','tenants',t.id);
 return t;
end;$$;

create function app_private.deletion_status(p_kind text,p_id uuid,p_tenant uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare reasons text[]:='{}';revision integer;
begin
 if p_kind='services' then
  select version into revision from public.services where id=p_id and tenant_id=p_tenant;
  if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
  if exists(select 1 from public.appointments where service_id=p_id) then reasons:=array_append(reasons,'appointments');end if;
  if exists(select 1 from public.clinical_templates where service_id=p_id) then reasons:=array_append(reasons,'clinical_templates');end if;
 elsif p_kind='clients' then
  select version into revision from public.clients where id=p_id and tenant_id=p_tenant;
  if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
  if exists(select 1 from public.appointments where client_id=p_id) then reasons:=array_append(reasons,'appointments');end if;
  if exists(select 1 from public.stored_files where client_id=p_id) then reasons:=array_append(reasons,'client_files');end if;
  if exists(select 1 from public.consents where client_id=p_id) or exists(select 1 from public.treatment_preparations where client_id=p_id)
   or exists(select 1 from public.photos where client_id=p_id) or exists(select 1 from public.photo_permissions where client_id=p_id) then reasons:=array_append(reasons,'clinical_records');end if;
  if exists(select 1 from public.privacy_requests where client_id=p_id) then reasons:=array_append(reasons,'privacy_requests');end if;
  if exists(select 1 from public.privacy_exports e left join app_private.privacy_export_payloads j on j.export_id=e.id where e.client_id=p_id and
   ((e.expires_at>clock_timestamp() and e.state<>'revoked') or j.export_id is null or j.cleaned_at is null or j.payload is not null
    or exists(select 1 from storage.objects o where o.bucket_id='glow-exports' and o.name=e.tenant_id::text||'/'||e.id::text||'/archive.zip'))) then reasons:=array_append(reasons,'privacy_exports');end if;
 else raise exception 'INVALID_RESOURCE' using errcode='22023';end if;
 return jsonb_build_object('allowed',cardinality(reasons)=0,'version',revision,'reasons',to_jsonb(reasons));
end;$$;
revoke all on function app_private.deletion_status(text,uuid,uuid) from public,anon,authenticated,service_role;
create function public.inspect_deletion(p_kind text,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.users:=app_private.management_owner();
begin return app_private.deletion_status(p_kind,p_id,u.tenant_id);end;$$;

create function public.delete_unused_resource(p_kind text,p_id uuid,p_version integer,p_confirmation text) returns boolean
language plpgsql security definer set search_path='' as $$
declare u public.users:=app_private.management_owner();status jsonb;
begin
 if p_confirmation is distinct from 'ELIMINA' then raise exception 'DELETE_CONFIRMATION_REQUIRED' using errcode='22023';end if;
 if p_version is null or p_version<1 then raise exception 'STALE_VERSION' using errcode='40001';end if;
 if p_kind='clients' then
  perform 1 from public.clients where id=p_id and tenant_id=u.tenant_id for update;
 elsif p_kind='services' then
  perform 1 from public.services where id=p_id and tenant_id=u.tenant_id for update;
 else raise exception 'INVALID_RESOURCE' using errcode='22023';end if;
 if not found then
  -- Recover a lost success response only for a real deletion in this tenant.
  if exists(select 1 from public.audit_log where tenant_id=u.tenant_id and action='resource.delete' and resource_type=p_kind and resource_id=p_id) then return true;end if;
  raise exception 'NOT_FOUND' using errcode='P0002';
 end if;
 status:=app_private.deletion_status(p_kind,p_id,u.tenant_id);
 if (status->>'version')::integer is distinct from p_version then raise exception 'STALE_VERSION' using errcode='40001';end if;
 if not (status->>'allowed')::boolean then raise exception 'RESOURCE_IN_USE' using errcode='P0001';end if;
 if p_kind='clients' then
  -- Only unused assignments are removed. Cleaned export metadata loses its
  -- client reference via the FK but remains available to late-upload cleanup.
  delete from public.client_assignments where client_id=p_id;
  delete from public.clients where id=p_id and tenant_id=u.tenant_id;
 else delete from public.services where id=p_id and tenant_id=u.tenant_id;end if;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(u.tenant_id,auth.uid(),'resource.delete',p_kind,p_id);
 return true;
exception when foreign_key_violation then
 raise exception 'RESOURCE_IN_USE' using errcode='P0001';
end;$$;
revoke all on function public.rename_workspace(text,integer),public.inspect_deletion(text,uuid),public.delete_unused_resource(text,uuid,integer,text) from public,anon;
grant execute on function public.rename_workspace(text,integer),public.inspect_deletion(text,uuid),public.delete_unused_resource(text,uuid,integer,text) to authenticated;
-- Keep direct tenant changes and deletions unavailable; all application entry
-- points must use the validated functions above.
revoke delete on public.clients,public.services from authenticated,anon;
