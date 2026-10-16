-- Serialize recipient/schedule edits with the final dispatch check.
create or replace function public.create_appointment(p_key uuid, p_data jsonb)
returns public.appointments language plpgsql security definer set search_path = '' as $$
declare
  profile public.users; service public.services; result public.appointments; prior app_private.idempotency_requests;
  op uuid := (p_data->>'operator_id')::uuid;
  hash text := encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
begin
  select * into profile from public.users where id=auth.uid() and active;
  if not found then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  perform 1 from public.tenants where id=profile.tenant_id for update;
  select * into profile from public.users where id=auth.uid() and active;
  if not found then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if profile.role<>'owner' and op<>profile.id then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_key is null then raise exception 'INVALID_KEY' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(profile.id::text||p_key::text,0));
  select * into prior from app_private.idempotency_requests where actor_id=profile.id and operation='create_appointment' and request_key=p_key;
  if found then
    if prior.request_hash<>hash then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
    select * into result from public.appointments where id=prior.resource_id and tenant_id=profile.tenant_id;
    return result;
  end if;
  select * into service from public.services where id=(p_data->>'service_id')::uuid and tenant_id=profile.tenant_id and active;
  if not found or not exists(select 1 from public.clients where id=(p_data->>'client_id')::uuid and tenant_id=profile.tenant_id and archived_at is null)
    or not exists(select 1 from public.locations where id=(p_data->>'location_id')::uuid and tenant_id=profile.tenant_id and active)
    or not exists(select 1 from public.users where id=op and tenant_id=profile.tenant_id and active)
  then raise exception 'INVALID_REFERENCE' using errcode='22023'; end if;
  insert into public.appointments(tenant_id,client_id,service_id,location_id,operator_id,service_name,price_cents,starts_at,ends_at)
  values(profile.tenant_id,(p_data->>'client_id')::uuid,service.id,(p_data->>'location_id')::uuid,op,service.name,
    coalesce((p_data->>'price_cents')::integer,service.price_cents),(p_data->>'starts_at')::timestamptz,(p_data->>'ends_at')::timestamptz)
  returning * into result;
  insert into app_private.idempotency_requests(actor_id,operation,request_key,request_hash,resource_id)
  values(profile.id,'create_appointment',p_key,hash,result.id);
  perform app_private.sync_reminder(result);
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
  perform 1 from public.tenants where id=profile.tenant_id for update;
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

create or replace function public.update_client(p_id uuid, p_version integer, p_data jsonb)
returns public.clients language plpgsql security definer set search_path = '' as $$
declare profile public.users; result public.clients;
begin
  select * into profile from public.users where id = auth.uid() and active;
  if not found then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  perform 1 from public.tenants where id=profile.tenant_id for update;
  select * into profile from public.users where id=auth.uid() and active;
  if not found then raise exception 'FORBIDDEN' using errcode='42501'; end if;
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

create or replace function public.begin_reminder_dispatch(p_id uuid,p_claim uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.messages; d app_private.reminder_dispatches; a public.appointments; t public.tenants; c public.clients; reason text; frozen jsonb;
begin
 perform 1 from public.tenants t join public.messages msg on msg.tenant_id=t.id where msg.id=p_id for update of t;
 perform 1 from public.appointments a join public.messages msg on msg.appointment_id=a.id where msg.id=p_id for update of a;
 select * into m from public.messages where id=p_id for update;
 select * into d from app_private.reminder_dispatches where message_id=p_id for update;
 if found and d.claim=p_claim and d.phase='claimed' and m.status='cancelled' and d.lease_until>clock_timestamp() then
  update app_private.reminder_dispatches set claim=null,lease_until=null,phase=null where message_id=p_id;
  return null;
 end if;
 if not found or m.status<>'processing' or d.claim is distinct from p_claim or d.phase<>'claimed' or d.lease_until<=clock_timestamp() then raise exception 'STALE_CLAIM' using errcode='40001'; end if;
 if not exists(select 1 from app_private.reminder_settings s join app_private.reminder_runs r on r.provider=s.provider where s.enabled and r.id=d.run_id) then
  update public.messages set status='queued',updated_at=clock_timestamp() where id=p_id;
  update app_private.reminder_dispatches set claim=null,lease_until=null,phase=null where message_id=p_id;
  return null;
 end if;
 reason:=app_private.reminder_ineligible(m);
 if reason is not null or m.attempts>=5 then
  update public.messages set status=case when reason='stale_schedule' then 'cancelled' when reason is not null then 'skipped' else 'failed' end,
  failure_code=coalesce(reason,'attempts_exhausted'),next_attempt_at=null,updated_at=clock_timestamp() where id=p_id;
  update app_private.reminder_dispatches set claim=null,lease_until=null,phase=null where message_id=p_id;
  return null;
 end if;
 select * into a from public.appointments where id=m.appointment_id;
 select * into t from public.tenants where id=m.tenant_id;
 select * into c from public.clients where id=a.client_id;
 frozen:=coalesce(d.envelope,jsonb_build_object('version','glow-reminder-v1','to',c.email,'subject','Promemoria appuntamento',
 'text','Hai un appuntamento con '||t.name||' il '||to_char(a.starts_at at time zone t.timezone,'DD/MM/YYYY "alle" HH24:MI')||'. Per variazioni contatta lo studio.'));
 update app_private.reminder_dispatches set envelope=frozen,first_dispatch_at=coalesce(first_dispatch_at,clock_timestamp()),phase='dispatching' where message_id=p_id;
 update public.messages set attempts=attempts+1,updated_at=clock_timestamp() where id=p_id;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(m.tenant_id,null,'reminder.dispatch','messages',p_id);
 return frozen;
end;
$$;
