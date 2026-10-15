-- Initial application schema. All application writes are tenant-scoped.
create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 100),
  timezone text not null default 'Europe/Rome',
  currency text not null default 'EUR' check (currency = 'EUR'),
  reminders_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 100),
  role text not null check (role in ('owner', 'operator')),
  active boolean not null default true,
  clinical_access boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 100),
  address text not null default '' check (char_length(address) <= 300),
  color text not null default '#28664f' check (color ~ '^#[0-9a-fA-F]{6}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 100),
  duration_minutes integer not null check (duration_minutes between 5 and 1440),
  price_cents integer not null default 0 check (price_cents between 0 and 100000000),
  color text not null default '#28664f' check (color ~ '^#[0-9a-fA-F]{6}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 100),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 100),
  search_name text generated always as (lower(first_name || ' ' || last_name)) stored,
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  archived_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create index clients_tenant_name on public.clients (tenant_id, last_name, first_name, id);
create index clients_search on public.clients using gin (search_name extensions.gin_trgm_ops);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  client_id uuid not null,
  service_id uuid not null,
  operator_id uuid not null,
  location_id uuid not null,
  service_name text not null,
  price_cents integer not null check (price_cents between 0 and 100000000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'booked' check (status in ('booked','confirmed','completed','no_show','cancelled')),
  version integer not null default 1,
  schedule_revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, client_id) references public.clients(tenant_id, id),
  foreign key (tenant_id, service_id) references public.services(tenant_id, id),
  foreign key (tenant_id, operator_id) references public.users(tenant_id, id),
  foreign key (tenant_id, location_id) references public.locations(tenant_id, id),
  check (ends_at > starts_at and ends_at <= starts_at + interval '24 hours')
);
set search_path = public, extensions, pg_catalog;
alter table public.appointments add constraint appointments_no_overlap
  exclude using gist (tenant_id with =, operator_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
  where (status in ('booked', 'confirmed'));
reset search_path;
create index appointments_tenant_start on public.appointments (tenant_id, starts_at);
create index appointments_tenant_client on public.appointments (tenant_id, client_id, starts_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  appointment_id uuid not null,
  schedule_revision integer not null,
  kind text not null check (kind = 'reminder_24h'),
  channel text not null default 'email' check (channel = 'email'),
  scheduled_for timestamptz not null,
  status text not null default 'queued' check (status in ('queued','processing','accepted','delivered','bounced','failed','cancelled','skipped','uncertain')),
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  provider_id text,
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, appointment_id) references public.appointments(tenant_id,id),
  unique (appointment_id, schedule_revision, kind, channel)
);
create index messages_queue on public.messages (scheduled_for) where status = 'queued';

create table public.audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id),
  actor_id uuid,
  action text not null,
  resource_type text not null,
  resource_id uuid not null,
  created_at timestamptz not null default now()
);
create index audit_log_tenant_time on public.audit_log (tenant_id, created_at desc);

create table app_private.idempotency_requests (
  actor_id uuid not null,
  operation text not null,
  request_key uuid not null,
  request_hash text not null,
  resource_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, operation, request_key)
);

create function app_private.current_tenant_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select tenant_id from public.users where id = auth.uid() and active
$$;
create function app_private.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'owner' from public.users where id = auth.uid() and active), false)
$$;
revoke all on function app_private.current_tenant_id(), app_private.is_owner() from public, anon;
grant execute on function app_private.current_tenant_id(), app_private.is_owner() to authenticated;

alter table public.tenants enable row level security;
alter table public.users enable row level security;
alter table public.locations enable row level security;
alter table public.services enable row level security;
alter table public.clients enable row level security;
alter table public.appointments enable row level security;
alter table public.messages enable row level security;
alter table public.audit_log enable row level security;

create policy tenant_read on public.tenants for select to authenticated using (id = app_private.current_tenant_id());
create policy users_read on public.users for select to authenticated using (tenant_id = app_private.current_tenant_id());
create policy locations_read on public.locations for select to authenticated using (tenant_id = app_private.current_tenant_id());
create policy locations_insert on public.locations for insert to authenticated with check (tenant_id = app_private.current_tenant_id() and app_private.is_owner());
create policy locations_update on public.locations for update to authenticated using (tenant_id = app_private.current_tenant_id() and app_private.is_owner()) with check (tenant_id = app_private.current_tenant_id() and app_private.is_owner());
create policy services_read on public.services for select to authenticated using (tenant_id = app_private.current_tenant_id());
create policy services_insert on public.services for insert to authenticated with check (tenant_id = app_private.current_tenant_id() and app_private.is_owner());
create policy services_update on public.services for update to authenticated using (tenant_id = app_private.current_tenant_id() and app_private.is_owner()) with check (tenant_id = app_private.current_tenant_id() and app_private.is_owner());
create policy clients_read on public.clients for select to authenticated using (tenant_id = app_private.current_tenant_id());
create policy clients_insert on public.clients for insert to authenticated with check (tenant_id = app_private.current_tenant_id());
create policy clients_update on public.clients for update to authenticated using (tenant_id = app_private.current_tenant_id()) with check (tenant_id = app_private.current_tenant_id());
create policy appointments_read on public.appointments for select to authenticated using (tenant_id = app_private.current_tenant_id());
create policy messages_read on public.messages for select to authenticated using (
  tenant_id = app_private.current_tenant_id() and (app_private.is_owner() or exists (
    select 1 from public.appointments a where a.id = appointment_id and a.operator_id = auth.uid()
  ))
);
create policy audit_read on public.audit_log for select to authenticated using (tenant_id = app_private.current_tenant_id() and app_private.is_owner());

revoke all on public.tenants, public.users, public.locations, public.services, public.clients, public.appointments, public.messages, public.audit_log from anon, authenticated;
grant select on public.tenants, public.users, public.locations, public.services, public.clients, public.appointments, public.messages, public.audit_log to authenticated;
grant insert (tenant_id, name, address, color) on public.locations to authenticated;
grant update (name, address, color, active) on public.locations to authenticated;
grant insert (tenant_id, name, duration_minutes, price_cents, color) on public.services to authenticated;
grant update (name, duration_minutes, price_cents, color, active) on public.services to authenticated;
grant insert (tenant_id, first_name, last_name, email, phone) on public.clients to authenticated;
-- Client edits and archival use a version-checked RPC, not unrestricted table updates.

create function app_private.audit_mutation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log(tenant_id, actor_id, action, resource_type, resource_id)
  values (new.tenant_id, auth.uid(), lower(tg_op), tg_table_name, new.id);
  return new;
end;
$$;
create trigger audit_clients after insert or update on public.clients for each row execute function app_private.audit_mutation();
create trigger audit_locations after insert or update on public.locations for each row execute function app_private.audit_mutation();
create trigger audit_services after insert or update on public.services for each row execute function app_private.audit_mutation();
create trigger audit_appointments after insert or update on public.appointments for each row execute function app_private.audit_mutation();

create function public.bootstrap_workspace(p_name text, p_display_name text, p_location text, p_service text, p_duration integer, p_price integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); tid uuid; profile public.users;
begin
  if uid is null or not exists(select 1 from auth.users where id = uid and email_confirmed_at is not null) then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  select * into profile from public.users where id = uid;
  if found then
    if not profile.active then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
    return profile.tenant_id;
  end if;
  insert into public.tenants(name) values (btrim(p_name)) returning id into tid;
  insert into public.users(id,tenant_id,display_name,role,clinical_access) values (uid,tid,btrim(p_display_name),'owner',true);
  insert into public.locations(tenant_id,name) values (tid,btrim(p_location));
  insert into public.services(tenant_id,name,duration_minutes,price_cents) values (tid,btrim(p_service),p_duration,p_price);
  return tid;
end;
$$;

create function public.update_client(p_id uuid, p_version integer, p_data jsonb)
returns public.clients language plpgsql security definer set search_path = '' as $$
declare profile public.users; result public.clients;
begin
  select * into profile from public.users where id = auth.uid() and active;
  if not found then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into result from public.clients where id = p_id and tenant_id = profile.tenant_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if result.version <> p_version then raise exception 'VERSION_CONFLICT' using errcode = '40001'; end if;
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

create function app_private.sync_reminder(p_appointment public.appointments) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.messages set status='cancelled',updated_at=now() where appointment_id=p_appointment.id
    and status='queued' and (schedule_revision<>p_appointment.schedule_revision or p_appointment.status not in ('booked','confirmed'));
  if p_appointment.status in ('booked','confirmed') and p_appointment.starts_at-interval '24 hours'>now()
    and exists(select 1 from public.tenants where id=p_appointment.tenant_id and reminders_enabled)
    and exists(select 1 from public.clients where id=p_appointment.client_id and email is not null)
  then
    insert into public.messages(tenant_id,appointment_id,schedule_revision,kind,scheduled_for)
    values(p_appointment.tenant_id,p_appointment.id,p_appointment.schedule_revision,'reminder_24h',p_appointment.starts_at-interval '24 hours')
    on conflict(appointment_id,schedule_revision,kind,channel) do nothing;
  end if;
end;
$$;

create function public.create_appointment(p_key uuid, p_data jsonb)
returns public.appointments language plpgsql security definer set search_path = '' as $$
declare
  profile public.users; service public.services; result public.appointments; prior app_private.idempotency_requests;
  op uuid := (p_data->>'operator_id')::uuid;
  hash text := encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
begin
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

create function public.update_appointment(p_id uuid, p_version integer, p_data jsonb)
returns public.appointments language plpgsql security definer set search_path = '' as $$
declare profile public.users; old_row public.appointments; result public.appointments; service public.services;
  new_status text; new_operator uuid; new_start timestamptz; new_end timestamptz; revision integer;
begin
  select * into profile from public.users where id=auth.uid() and active;
  if not found then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into old_row from public.appointments where id=p_id and tenant_id=profile.tenant_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  if profile.role<>'owner' and old_row.operator_id<>profile.id then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if old_row.version<>p_version then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
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

revoke all on all functions in schema app_private from public, anon, authenticated;
grant execute on function app_private.current_tenant_id(), app_private.is_owner() to authenticated;
revoke all on function public.bootstrap_workspace(text,text,text,text,integer,integer),
  public.update_client(uuid,integer,jsonb), public.create_appointment(uuid,jsonb), public.update_appointment(uuid,integer,jsonb)
  from public, anon;
grant execute on function public.bootstrap_workspace(text,text,text,text,integer,integer),
  public.update_client(uuid,integer,jsonb), public.create_appointment(uuid,jsonb), public.update_appointment(uuid,integer,jsonb)
  to authenticated;

-- No scheduler or sender is enabled by this migration. The tenant flag stays false
-- until the email worker and its provider have passed the dedicated increment.
