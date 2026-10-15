-- Reject null expected versions even on direct authenticated RPC calls.
-- Also serialize owner assignment against membership suspension.

create or replace function public.update_client(p_id uuid, p_version integer, p_data jsonb)
returns public.clients language plpgsql security definer set search_path = '' as $$
declare profile public.users; result public.clients;
begin
  select * into profile from public.users where id = auth.uid() and active;
  if not found then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into result from public.clients where id = p_id and tenant_id = profile.tenant_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if result.version is distinct from p_version then raise exception 'VERSION_CONFLICT' using errcode = '40001'; end if;
  if p_data ? 'archived' then
    if profile.role <> 'owner' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
    if (p_data->>'archived')::boolean and exists(select 1 from public.appointments where client_id = p_id and status in ('booked','confirmed') and starts_at > now()) then
      raise exception 'UPCOMING_APPOINTMENTS' using errcode = '22023';
    end if;
    update public.clients set archived_at = case when (p_data->>'archived')::boolean then now() else null end,
      version = version+1, updated_at=now() where id=p_id returning * into result;
  else
    update public.clients set first_name=btrim(p_data->>'first_name'), last_name=btrim(p_data->>'last_name'),
      email=nullif(btrim(p_data->>'email'),''), phone=nullif(p_data->>'phone',''), version=version+1,updated_at=now()
    where id=p_id returning * into result;
  end if;
  return result;
end;
$$;

create or replace function public.update_appointment(p_id uuid, p_version integer, p_data jsonb)
returns public.appointments language plpgsql security definer set search_path = '' as $$
declare profile public.users; old_row public.appointments; result public.appointments; service public.services;
  new_status text; new_operator uuid; new_start timestamptz; new_end timestamptz; revision integer;
begin
  select * into profile from public.users where id=auth.uid() and active;
  if not found then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into old_row from public.appointments where id=p_id and tenant_id=profile.tenant_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  if profile.role<>'owner' and old_row.operator_id<>profile.id then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if old_row.version is distinct from p_version then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
  if old_row.status in ('completed','no_show','cancelled') then raise exception 'TERMINAL_APPOINTMENT' using errcode='22023'; end if;
  new_status:=coalesce(p_data->>'status',old_row.status);
  new_operator:=coalesce((p_data->>'operator_id')::uuid,old_row.operator_id);
  new_start:=coalesce((p_data->>'starts_at')::timestamptz,old_row.starts_at);
  new_end:=coalesce((p_data->>'ends_at')::timestamptz,old_row.ends_at);
  if new_status not in ('booked','confirmed','completed','no_show','cancelled') or (old_row.status='confirmed' and new_status='booked') then
    raise exception 'INVALID_STATUS' using errcode='22023';
  end if;
  if new_status in ('completed','no_show') and new_start>now() then raise exception 'APPOINTMENT_IN_FUTURE' using errcode='22023'; end if;
  if profile.role<>'owner' and new_operator<>profile.id then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into service from public.services where id=coalesce((p_data->>'service_id')::uuid,old_row.service_id) and tenant_id=profile.tenant_id;
  if not found or (not service.active and service.id<>old_row.service_id) or not exists(select 1 from public.locations where id=coalesce((p_data->>'location_id')::uuid,old_row.location_id) and tenant_id=profile.tenant_id and (active or id=old_row.location_id))
    or not exists(select 1 from public.users where id=new_operator and tenant_id=profile.tenant_id and active)
  then raise exception 'INVALID_REFERENCE' using errcode='22023'; end if;
  revision:=old_row.schedule_revision;
  if new_start<>old_row.starts_at or new_end<>old_row.ends_at or new_operator<>old_row.operator_id
    or coalesce((p_data->>'location_id')::uuid,old_row.location_id)<>old_row.location_id
    or new_status in ('cancelled','completed','no_show') then revision:=revision+1; end if;
  update public.appointments set service_id=service.id,
    service_name=case when service.id<>old_row.service_id then service.name else old_row.service_name end,
    price_cents=coalesce((p_data->>'price_cents')::integer,case when service.id<>old_row.service_id then service.price_cents else old_row.price_cents end),
    location_id=coalesce((p_data->>'location_id')::uuid,old_row.location_id),operator_id=new_operator,
    starts_at=new_start,ends_at=new_end,status=new_status,version=version+1,schedule_revision=revision,updated_at=now()
  where id=p_id returning * into result;
  perform app_private.sync_reminder(result);
  return result;
end;
$$;

create or replace function public.update_team_member(p_id uuid,p_version integer,p_active boolean,p_clinical_access boolean) returns public.users
language plpgsql security definer set search_path='' as $$
declare actor public.users; target public.users;
begin
  select * into actor from public.users where id=auth.uid() and active and role='owner';
  if not found then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  perform 1 from public.tenants where id=actor.tenant_id for update;
  select * into target from public.users where id=p_id and tenant_id=actor.tenant_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  -- Ownership changes are a separate future flow; never demote/deactivate an owner here.
  if target.role='owner' then raise exception 'OWNER_PROTECTED' using errcode='22023'; end if;
  if target.version is distinct from p_version then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
  if p_active is null or p_clinical_access is null then raise exception 'INVALID_MEMBER' using errcode='22023'; end if;
  update public.users set active=p_active,clinical_access=p_clinical_access,version=version+1 where id=p_id returning * into target;
  if not p_active then
    update public.client_assignments set active=false,version=version+1,updated_at=now() where tenant_id=actor.tenant_id and operator_id=p_id and active;
  end if;
  return target;
end;
$$;

create or replace function public.set_client_assignment(p_client_id uuid,p_operator_id uuid,p_assigned boolean,p_version integer) returns public.client_assignments
language plpgsql security definer set search_path='' as $$
declare actor public.users; result public.client_assignments;
begin
  select * into actor from public.users where id=auth.uid() and active and role='owner';
  if not found then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  perform 1 from public.tenants where id=actor.tenant_id for update;
  if p_assigned is null or not exists(select 1 from public.clients where id=p_client_id and tenant_id=actor.tenant_id)
    or not exists(select 1 from public.users where id=p_operator_id and tenant_id=actor.tenant_id and role='operator' and active) then
    raise exception 'INVALID_REFERENCE' using errcode='22023'; end if;
  select * into result from public.client_assignments where tenant_id=actor.tenant_id and client_id=p_client_id and operator_id=p_operator_id for update;
  if found then
    if result.version is distinct from p_version then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
    update public.client_assignments set active=p_assigned,version=version+1,assigned_by=actor.id,updated_at=now() where id=result.id returning * into result;
  else
    if p_version is distinct from 0 then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
    insert into public.client_assignments(tenant_id,client_id,operator_id,active,assigned_by) values(actor.tenant_id,p_client_id,p_operator_id,p_assigned,actor.id) returning * into result;
  end if;
  return result;
end;
$$;

create or replace function app_private.assign_appointment_client() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.operator_id=old.operator_id and new.client_id=old.client_id then return new; end if;
  if exists(select 1 from public.users where id=auth.uid() and tenant_id=new.tenant_id and active and role='owner') then
    perform 1 from public.tenants where id=new.tenant_id for update;
    if not exists(select 1 from public.users where id=new.operator_id and tenant_id=new.tenant_id and active) then
      raise exception 'INVALID_REFERENCE' using errcode='22023';
    end if;
    if not exists(select 1 from public.users where id=new.operator_id and tenant_id=new.tenant_id and role='operator') then return new; end if;
    insert into public.client_assignments(tenant_id,client_id,operator_id,assigned_by)
      values(new.tenant_id,new.client_id,new.operator_id,auth.uid())
      on conflict(tenant_id,client_id,operator_id) do update set active=true,version=public.client_assignments.version+1,assigned_by=excluded.assigned_by,updated_at=now();
  end if;
  return new;
end;
$$;
