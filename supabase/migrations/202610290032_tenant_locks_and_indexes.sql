-- Tenant ids never change in application operations. Keep serialization and
-- the existing lock/recheck order, allowing FK KEY SHARE on unrelated inserts.
do $$
declare item record;changed text;begin
 for item in
  select p.oid,pg_get_functiondef(p.oid) definition from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('public','app_private') and p.prokind='f'
   and p.prosrc ~ 'from public\.tenants[^;]*for update;'
 loop
  changed:=regexp_replace(item.definition,'(from public\.tenants[^;]*?)for update;','\1for no key update;','g');
  if changed=item.definition or changed ~ 'from public\.tenants[^;]*for update;'
   then raise exception 'Tenant lock transformation failed: %',item.oid::regprocedure;end if;
  execute changed;
 end loop;
end;$$;

create index audit_log_actor_action_time on public.audit_log(actor_id,action,created_at desc);
create index audit_log_tenant_resource on public.audit_log(tenant_id,resource_id);
create index preparations_tenant_client on public.treatment_preparations(tenant_id,client_id);
create index consents_tenant_client on public.consents(tenant_id,client_id,signed_at desc,id);
create index appointments_tenant_service on public.appointments(tenant_id,service_id);
create index appointments_tenant_location on public.appointments(tenant_id,location_id);

-- Audit-backed rate checks stay limited to the already authorized tenant.
do $$
declare definition text;begin
 definition:=pg_get_functiondef('public.authorize_file_read(uuid)'::regprocedure);
 if definition not like '%where actor_id=auth.uid() and action=''file.read''%' then raise exception 'Unexpected file read limiter';end if;
 definition:=replace(definition,'where actor_id=auth.uid() and action=''file.read''','where tenant_id=f.tenant_id and actor_id=auth.uid() and action=''file.read''');
 execute definition;
end;$$;
