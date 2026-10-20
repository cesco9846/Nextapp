-- W17: a capability is scoped to one appointment schedule, never to a dossier.
alter table public.tenants add column cancellation_notice_hours integer not null default 0 check(cancellation_notice_hours between 0 and 168);
create table app_private.appointment_action_links (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 appointment_id uuid not null, schedule_revision integer not null, appointment_version integer not null,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 created_by uuid references public.users(id), request_id uuid,
 message_id uuid unique references public.messages(id),
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null,
 revoked_at timestamptz, unique(created_by,request_id),
 foreign key(tenant_id,appointment_id) references public.appointments(tenant_id,id)
);
create index appointment_action_links_appointment on app_private.appointment_action_links(tenant_id,appointment_id,created_at desc);
create table app_private.appointment_responses (
 id uuid primary key default gen_random_uuid(), link_id uuid not null references app_private.appointment_action_links(id),
 action text not null check(action in('confirm','cancel')), request_id uuid not null,
 responded_at timestamptz not null default clock_timestamp(), unique(link_id,action), unique(link_id,request_id)
);
create table app_private.appointment_response_limits (
 key text not null, window_start timestamptz not null, attempts integer not null, primary key(key,window_start)
);
alter table app_private.appointment_action_links enable row level security;
alter table app_private.appointment_responses enable row level security;
alter table app_private.appointment_response_limits enable row level security;
revoke all on app_private.appointment_action_links,app_private.appointment_responses,app_private.appointment_response_limits from public,anon,authenticated,service_role;

create function public.appointment_response_preferences(p_notice_hours integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant uuid:=app_private.current_tenant_id(); hours integer;
begin
 perform 1 from public.tenants where id=tenant for update;
 if tenant is null or not app_private.is_owner() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_notice_hours is not null then
  if p_notice_hours not between 0 and 168 then raise exception 'INVALID_NOTICE' using errcode='22023'; end if;
  update public.tenants set cancellation_notice_hours=p_notice_hours where id=tenant;
  insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(tenant,auth.uid(),'appointment.response_preferences','tenants',tenant);
 end if;
 select cancellation_notice_hours into hours from public.tenants where id=tenant;
 return jsonb_build_object('notice_hours',hours);
end;$$;
revoke all on function public.appointment_response_preferences(integer) from public,anon,service_role;
grant execute on function public.appointment_response_preferences(integer) to authenticated;

create function app_private.issue_appointment_action_link(p_appointment public.appointments,p_actor uuid,p_request uuid,p_message uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare token text:=encode(extensions.gen_random_bytes(32),'hex'); l app_private.appointment_action_links;
begin
 insert into app_private.appointment_action_links(tenant_id,appointment_id,schedule_revision,appointment_version,token_hash,created_by,request_id,message_id,expires_at)
 values(p_appointment.tenant_id,p_appointment.id,p_appointment.schedule_revision,p_appointment.version,encode(extensions.digest(token,'sha256'),'hex'),p_actor,p_request,p_message,
  least(p_appointment.starts_at,clock_timestamp()+interval '30 days')) returning * into l;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(l.tenant_id,p_actor,'appointment.link_created','appointments',l.appointment_id);
 return jsonb_build_object('id',l.id,'expires_at',l.expires_at,'token',token);
end;$$;
revoke all on function app_private.issue_appointment_action_link(public.appointments,uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- A single RPC provides authorized metadata, issue and revoke. Hashes never leave SQL.
create function public.manage_appointment_action_links(p_appointment_id uuid,p_action text default 'list',p_version integer default null,p_request_id uuid default null,p_link_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant uuid:=app_private.current_tenant_id(); profile public.users; a public.appointments; l app_private.appointment_action_links; result jsonb;
begin
 perform 1 from public.tenants where id=tenant for update;
 select * into profile from public.users where id=auth.uid() and tenant_id=tenant and active;
 if not found then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into a from public.appointments where id=p_appointment_id and tenant_id=tenant for update;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 if profile.role<>'owner' and a.operator_id<>profile.id then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_action='issue' then
  if p_request_id is null then raise exception 'INVALID_KEY' using errcode='22023'; end if;
  select * into l from app_private.appointment_action_links where created_by=profile.id and request_id=p_request_id;
  if found then
   if l.appointment_id<>a.id or l.appointment_version is distinct from p_version then raise exception 'IDEMPOTENCY_MISMATCH' using errcode='23505'; end if;
   return jsonb_build_object('id',l.id,'expires_at',l.expires_at,'token',null);
  end if;
  if a.version is distinct from p_version then raise exception 'STALE_VERSION' using errcode='40001'; end if;
  if a.status not in('booked','confirmed') or a.starts_at<=clock_timestamp() or exists(select 1 from public.clients where id=a.client_id and archived_at is not null) then
   raise exception 'TERMINAL_APPOINTMENT' using errcode='22023'; end if;
  if (select count(*) from app_private.appointment_action_links where tenant_id=tenant and created_at>clock_timestamp()-interval '1 hour')>=60 then raise exception 'RATE_LIMIT' using errcode='54000'; end if;
  update app_private.appointment_action_links set revoked_at=clock_timestamp() where appointment_id=a.id and created_by is not null and revoked_at is null;
  return app_private.issue_appointment_action_link(a,profile.id,p_request_id,null);
 elsif p_action='revoke' then
  update app_private.appointment_action_links set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=p_link_id and appointment_id=a.id returning * into l;
  if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(tenant,profile.id,'appointment.link_revoked','appointments',a.id);
 elsif p_action is distinct from 'list' then raise exception 'INVALID_ACTION' using errcode='22023'; end if;
 select jsonb_build_object('links',coalesce((select jsonb_agg(x) from (
  select id,created_at,expires_at,revoked_at,schedule_revision,case when message_id is null then 'manual' else 'email' end as source
  from app_private.appointment_action_links where appointment_id=a.id order by created_at desc,id limit 10
 ) x),'[]'::jsonb),'events',coalesce((select jsonb_agg(x) from (
  select r.id,r.action,r.responded_at from app_private.appointment_responses r join app_private.appointment_action_links k on k.id=r.link_id
  where k.appointment_id=a.id order by r.responded_at desc,r.id limit 10
 ) x),'[]'::jsonb)) into result;
 return result;
end;$$;
revoke all on function public.manage_appointment_action_links(uuid,text,integer,uuid,uuid) from public,anon,service_role;
grant execute on function public.manage_appointment_action_links(uuid,text,integer,uuid,uuid) to authenticated;

create function public.use_appointment_action_link(p_token_hash text,p_action text,p_request_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l app_private.appointment_action_links; a public.appointments; issuer public.users; t public.tenants;
 receipt app_private.appointment_responses; attempts integer; bucket timestamptz:=date_trunc('minute',clock_timestamp());
 denied constant jsonb:='{"ok":false,"status":410,"code":"APPOINTMENT_LINK_UNAVAILABLE"}'; deadline timestamptz;
begin
 delete from app_private.appointment_response_limits where window_start<bucket-interval '1 hour';
 insert into app_private.appointment_response_limits values('global',bucket,1) on conflict(key,window_start) do update set attempts=appointment_response_limits.attempts+1 returning appointment_response_limits.attempts into attempts;
 if attempts>300 then return jsonb_build_object('ok',false,'status',429); end if;
 if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then return denied; end if;
 insert into app_private.appointment_response_limits values(p_token_hash,bucket,1) on conflict(key,window_start) do update set attempts=appointment_response_limits.attempts+1 returning appointment_response_limits.attempts into attempts;
 if attempts>20 then return jsonb_build_object('ok',false,'status',429); end if;
 if p_action is null or p_action not in('read','confirm','cancel') or (p_action<>'read' and p_request_id is null) then return jsonb_build_object('ok',false,'status',400); end if;
 select * into l from app_private.appointment_action_links where token_hash=p_token_hash;
 if not found then return denied; end if;
 -- Same lock order as edits, final dispatch checks, preference edits and revocation.
 select * into t from public.tenants where id=l.tenant_id for update;
 select * into a from public.appointments where id=l.appointment_id for update;
 select * into l from app_private.appointment_action_links where id=l.id for update;
 if l.revoked_at is not null or l.expires_at<=clock_timestamp() or exists(select 1 from public.clients where id=a.client_id and archived_at is not null) then return denied; end if;
 if l.created_by is not null then
  select * into issuer from public.users where id=l.created_by;
  if not issuer.active or issuer.tenant_id<>l.tenant_id or (issuer.role<>'owner' and issuer.id<>a.operator_id) then return denied; end if;
 end if;
 -- A cancel receipt survives its own revision increment, never a reschedule.
 if a.schedule_revision<>l.schedule_revision or a.status not in('booked','confirmed') then
  select * into receipt from app_private.appointment_responses where link_id=l.id and action='cancel';
  if not found or a.status<>'cancelled' or a.schedule_revision<>l.schedule_revision+1 then return denied; end if;
  if p_action<>'read' and (p_action<>'cancel' or receipt.request_id<>p_request_id) then return denied; end if;
  return jsonb_build_object('ok',true,'receipt',to_jsonb(receipt)-'link_id'-'request_id');
 end if;
 if a.starts_at<=clock_timestamp() then return denied; end if;
 deadline:=a.starts_at-make_interval(hours=>t.cancellation_notice_hours);
 if p_action='read' then
  return jsonb_build_object('ok',true,'context',jsonb_build_object('studio',t.name,'timezone',t.timezone,'starts_at',a.starts_at,'ends_at',a.ends_at,
   'location',(select name from public.locations where id=a.location_id),'status',a.status,'expires_at',l.expires_at,
   'cancel_until',deadline,'can_cancel',clock_timestamp()<deadline));
 end if;
 select * into receipt from app_private.appointment_responses where link_id=l.id and request_id=p_request_id;
 if found and receipt.action<>p_action then return jsonb_build_object('ok',false,'status',409); end if;
 select * into receipt from app_private.appointment_responses where link_id=l.id and action=p_action;
 if found then return jsonb_build_object('ok',true,'receipt',to_jsonb(receipt)-'link_id'-'request_id'); end if;
 if p_action='cancel' and clock_timestamp()>=deadline then return jsonb_build_object('ok',false,'status',422,'code','CANCELLATION_CLOSED'); end if;
 if p_action='cancel' then
  update public.appointments set status='cancelled',version=version+1,schedule_revision=schedule_revision+1,updated_at=clock_timestamp() where id=a.id returning * into a;
 elsif a.status='booked' then
  update public.appointments set status='confirmed',version=version+1,updated_at=clock_timestamp() where id=a.id returning * into a;
 end if;
 perform app_private.sync_reminder(a);
 insert into app_private.appointment_responses(link_id,action,request_id) values(l.id,p_action,p_request_id) returning * into receipt;
 insert into public.audit_log(tenant_id,action,resource_type,resource_id) values(l.tenant_id,'appointment.client_'||p_action,'appointments',a.id);
 return jsonb_build_object('ok',true,'receipt',to_jsonb(receipt)-'link_id'-'request_id');
end;$$;
revoke all on function public.use_appointment_action_link(text,text,uuid) from public,anon,authenticated;
grant execute on function public.use_appointment_action_link(text,text,uuid) to service_role;

-- Preserve all historical envelopes and idempotency keys. Only a first frozen
-- v2 envelope receives a new link, atomically with its dispatch boundary.
alter function public.begin_reminder_dispatch(uuid,uuid) set schema app_private;
alter function app_private.begin_reminder_dispatch(uuid,uuid) rename to begin_reminder_dispatch_without_links;
revoke all on function app_private.begin_reminder_dispatch_without_links(uuid,uuid) from public,anon,authenticated,service_role;
create function public.begin_reminder_dispatch(p_id uuid,p_claim uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; frozen jsonb; link jsonb; a public.appointments;
begin
 perform 1 from public.tenants t join public.messages m on m.tenant_id=t.id where m.id=p_id for update of t;
 select x.* into a from public.appointments x join public.messages m on m.appointment_id=x.id where m.id=p_id for update of x;
 perform 1 from public.messages where id=p_id for update;
 select envelope into prior from app_private.reminder_dispatches where message_id=p_id for update;
 frozen:=app_private.begin_reminder_dispatch_without_links(p_id,p_claim);
 if frozen is not null and prior is null and frozen->>'version'='glow-reminder-v2' then
  link:=app_private.issue_appointment_action_link(a,null,null,p_id);
  frozen:=jsonb_set(frozen,'{text}',to_jsonb((frozen->>'text')||E'\n\nConferma o disdici il tuo appuntamento:\nhttps://glowlabs.it/appuntamento#'||(link->>'token')||E'\nIl collegamento è personale. Le modifiche richiedono una conferma nella pagina.'));
  update app_private.reminder_dispatches set envelope=frozen where message_id=p_id;
 end if;
 return frozen;
end;$$;
revoke all on function public.begin_reminder_dispatch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_reminder_dispatch(uuid,uuid) to service_role;
