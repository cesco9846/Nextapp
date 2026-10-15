-- Team access is always checked against current membership, never JWT role claims.
alter table public.users add column version integer not null default 1 check (version > 0);

create table public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  email text not null check (email = lower(btrim(email)) and char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  role text not null default 'operator' check (role = 'operator'),
  clinical_access boolean not null default false,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '72 hours',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  revoked_at timestamptz,
  foreign key (tenant_id,created_by) references public.users(tenant_id,id),
  check (expires_at > created_at),
  check ((accepted_at is null) = (accepted_by is null)),
  check (accepted_at is null or revoked_at is null)
);
create unique index invitations_pending_email on public.user_invitations(tenant_id,email) where accepted_at is null and revoked_at is null;
create index invitations_tenant_created on public.user_invitations(tenant_id,created_at desc);
alter table public.user_invitations enable row level security;
create policy invitations_owner_read on public.user_invitations for select to authenticated
  using (tenant_id=app_private.current_tenant_id() and app_private.is_owner());
revoke all on public.user_invitations from public,anon,authenticated;
grant select(id,tenant_id,email,role,clinical_access,created_at,expires_at,accepted_at,revoked_at) on public.user_invitations to authenticated;
create trigger audit_invitations after insert or update on public.user_invitations for each row execute function app_private.audit_mutation();

create table public.client_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  client_id uuid not null,
  operator_id uuid not null,
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  assigned_by uuid not null,
  updated_at timestamptz not null default now(),
  unique (tenant_id,client_id,operator_id),
  foreign key (tenant_id,client_id) references public.clients(tenant_id,id),
  foreign key (tenant_id,operator_id) references public.users(tenant_id,id),
  foreign key (tenant_id,assigned_by) references public.users(tenant_id,id)
);
alter table public.client_assignments enable row level security;
create policy assignments_read on public.client_assignments for select to authenticated
  using (tenant_id=app_private.current_tenant_id() and (app_private.is_owner() or operator_id=auth.uid()));
revoke all on public.client_assignments from public,anon,authenticated;
grant select on public.client_assignments to authenticated;
create trigger audit_assignments after insert or update on public.client_assignments for each row execute function app_private.audit_mutation();
create trigger audit_users after update on public.users for each row execute function app_private.audit_mutation();

create function public.membership_state() returns text
language sql stable security definer set search_path='' as $$
  select coalesce((select case when active then 'active' else 'inactive' end from public.users where id=auth.uid()),'none');
$$;

create function public.create_team_invitation(p_email text,p_clinical_access boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare profile public.users; address text:=lower(btrim(p_email)); token text; result public.user_invitations;
begin
  select * into profile from public.users where id=auth.uid() and active and role='owner';
  if not found then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  perform 1 from public.tenants where id=profile.tenant_id for update;
  if address is null or address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or char_length(address)>254 then
    raise exception 'INVALID_EMAIL' using errcode='22023'; end if;
  if exists(select 1 from public.users u join auth.users a on a.id=u.id where u.tenant_id=profile.tenant_id and u.active and lower(a.email)=address) then
    raise exception 'ALREADY_TEAM_MEMBER' using errcode='22023'; end if;
  if (select count(*) from public.user_invitations where tenant_id=profile.tenant_id and created_at>now()-interval '1 hour')>=50 then
    raise exception 'INVITATION_RATE_LIMIT' using errcode='54000'; end if;
  update public.user_invitations set revoked_at=now() where tenant_id=profile.tenant_id and email=address and accepted_at is null and revoked_at is null;
  token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into public.user_invitations(tenant_id,email,clinical_access,token_hash,created_by)
    values(profile.tenant_id,address,p_clinical_access,encode(extensions.digest(token,'sha256'),'hex'),profile.id) returning * into result;
  return jsonb_build_object('id',result.id,'email',result.email,'clinical_access',result.clinical_access,'expires_at',result.expires_at,'token',token);
end;
$$;

create function public.revoke_team_invitation(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare profile public.users; invitation public.user_invitations;
begin
  select * into profile from public.users where id=auth.uid() and active and role='owner';
  if not found then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  perform 1 from public.tenants where id=profile.tenant_id for update;
  select * into invitation from public.user_invitations where id=p_id and tenant_id=profile.tenant_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  if invitation.accepted_at is not null then raise exception 'INVITATION_ALREADY_USED' using errcode='22023'; end if;
  update public.user_invitations set revoked_at=coalesce(revoked_at,now()) where id=p_id;
end;
$$;

create function public.accept_team_invitation(p_token text,p_display_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); address text; invitation public.user_invitations; profile public.users;
begin
  if uid is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0)); -- same identity lock as onboarding
  select lower(email) into address from auth.users where id=uid and email_confirmed_at is not null;
  if not found then raise exception 'VERIFIED_EMAIL_REQUIRED' using errcode='42501'; end if;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INVITATION' using errcode='22023'; end if;
  select * into invitation from public.user_invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  if not found then raise exception 'INVALID_INVITATION' using errcode='22023'; end if;
  perform 1 from public.tenants where id=invitation.tenant_id for update;
  select * into invitation from public.user_invitations where id=invitation.id for update;
  if invitation.email<>address then raise exception 'INVITATION_EMAIL_MISMATCH' using errcode='22023'; end if;
  select * into profile from public.users where id=uid;
  if invitation.accepted_by=uid and profile.active and profile.tenant_id=invitation.tenant_id then return profile.tenant_id; end if;
  if invitation.revoked_at is not null or invitation.accepted_at is not null or invitation.expires_at<=clock_timestamp()
    or not exists(select 1 from public.users where id=invitation.created_by and tenant_id=invitation.tenant_id and role='owner' and active) then
    raise exception 'INVALID_INVITATION' using errcode='22023'; end if;
  if profile.id is not null and (profile.tenant_id<>invitation.tenant_id or profile.active or profile.role='owner') then
    raise exception 'ACCOUNT_ALREADY_ASSIGNED' using errcode='22023'; end if;
  if p_display_name is null or char_length(btrim(p_display_name)) not between 2 and 100 then raise exception 'INVALID_NAME' using errcode='22023'; end if;
  insert into public.users(id,tenant_id,display_name,role,active,clinical_access)
    values(uid,invitation.tenant_id,btrim(p_display_name),'operator',true,invitation.clinical_access)
    on conflict(id) do update set display_name=excluded.display_name,active=true,clinical_access=excluded.clinical_access,version=public.users.version+1;
  update public.user_invitations set accepted_at=now(),accepted_by=uid where id=invitation.id;
  return invitation.tenant_id;
end;
$$;

create function public.update_team_member(p_id uuid,p_version integer,p_active boolean,p_clinical_access boolean) returns public.users
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
  if target.version<>p_version then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
  if p_active is null or p_clinical_access is null then raise exception 'INVALID_MEMBER' using errcode='22023'; end if;
  update public.users set active=p_active,clinical_access=p_clinical_access,version=version+1 where id=p_id returning * into target;
  if not p_active then
    update public.client_assignments set active=false,version=version+1,updated_at=now() where tenant_id=actor.tenant_id and operator_id=p_id and active;
  end if;
  return target;
end;
$$;

create function public.set_client_assignment(p_client_id uuid,p_operator_id uuid,p_assigned boolean,p_version integer) returns public.client_assignments
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
    if result.version<>p_version then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
    update public.client_assignments set active=p_assigned,version=version+1,assigned_by=actor.id,updated_at=now() where id=result.id returning * into result;
  else
    if p_version is distinct from 0 then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
    insert into public.client_assignments(tenant_id,client_id,operator_id,active,assigned_by) values(actor.tenant_id,p_client_id,p_operator_id,p_assigned,actor.id) returning * into result;
  end if;
  return result;
end;
$$;

create function public.can_access_client_clinical(p_client_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.users u join public.clients c on c.tenant_id=u.tenant_id
    where u.id=auth.uid() and u.active and c.id=p_client_id
      and (u.role='owner' or (u.clinical_access and exists(select 1 from public.client_assignments a
        where a.tenant_id=u.tenant_id and a.client_id=c.id and a.operator_id=u.id and a.active))));
$$;

create function app_private.assign_appointment_client() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.operator_id=old.operator_id and new.client_id=old.client_id then return new; end if;
  if exists(select 1 from public.users where id=auth.uid() and tenant_id=new.tenant_id and active and role='owner')
    and exists(select 1 from public.users where id=new.operator_id and tenant_id=new.tenant_id and active and role='operator') then
    insert into public.client_assignments(tenant_id,client_id,operator_id,assigned_by)
      values(new.tenant_id,new.client_id,new.operator_id,auth.uid())
      on conflict(tenant_id,client_id,operator_id) do update set active=true,version=public.client_assignments.version+1,assigned_by=excluded.assigned_by,updated_at=now();
  end if;
  return new;
end;
$$;
create trigger assign_appointment_client after insert or update of operator_id,client_id on public.appointments for each row execute function app_private.assign_appointment_client();
revoke all on function app_private.assign_appointment_client() from public,anon,authenticated;
revoke all on function public.membership_state(),public.create_team_invitation(text,boolean),public.revoke_team_invitation(uuid),public.accept_team_invitation(text,text),public.update_team_member(uuid,integer,boolean,boolean),public.set_client_assignment(uuid,uuid,boolean,integer),public.can_access_client_clinical(uuid) from public,anon;
grant execute on function public.membership_state(),public.create_team_invitation(text,boolean),public.revoke_team_invitation(uuid),public.accept_team_invitation(text,text),public.update_team_member(uuid,integer,boolean,boolean),public.set_client_assignment(uuid,uuid,boolean,integer),public.can_access_client_clinical(uuid) to authenticated;
