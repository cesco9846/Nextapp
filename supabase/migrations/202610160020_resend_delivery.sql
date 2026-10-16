-- W16 Resend: additive identity, signed-event evidence and tenant suppression.
-- No credentials, enablement, fixture or historical snapshot rewrite.
alter table public.messages drop constraint messages_failure_code_check;
alter table public.messages add constraint messages_failure_code_check check(failure_code in(
 'provider_retryable','provider_rejected','attempts_exhausted','provider_unknown','worker_interrupted',
 'stale_schedule','delivery_window_expired','no_recipient','recipient_changed','sender_not_ready',
 'recipient_suppressed','provider_bounced','provider_failed','provider_complained','provider_suppressed','legacy_envelope'));
alter table app_private.reminder_dispatches add column acceptance_id uuid unique;
alter table app_private.reminder_dispatches add column delivery_rank integer not null default 0;
alter table app_private.reminder_dispatches add column delivery_state text check(delivery_state in('accepted','delivered','bounced','failed'));
alter table app_private.reminder_dispatches add column delivery_code text;
create table app_private.resend_events (
 event_id text primary key, message_id uuid not null references public.messages(id),
 provider_id uuid not null, type text not null, occurred_at timestamptz not null,
 received_at timestamptz not null default clock_timestamp()
);
create index resend_events_message on app_private.resend_events(message_id);
create table app_private.reminder_suppressions (
 tenant_id uuid not null references public.tenants(id), email text not null,
 reason text not null, created_at timestamptz not null default clock_timestamp(),
 primary key(tenant_id,email)
);
alter table app_private.resend_events enable row level security;
alter table app_private.reminder_suppressions enable row level security;
revoke all on app_private.resend_events,app_private.reminder_suppressions from public,anon,authenticated,service_role;

-- Only a currently active owner with a confirmed Auth mailbox can be Reply-To.
create function app_private.reminder_reply_to(p_tenant uuid) returns text language sql stable security definer set search_path='' as $$
 select a.email from public.users u join auth.users a on a.id=u.id
 where u.tenant_id=p_tenant and u.role='owner' and u.active and a.email_confirmed_at is not null
 and a.email !~ '[[:space:]<>]' and length(a.email)<=254 order by u.id limit 1;
$$;
revoke all on function app_private.reminder_reply_to(uuid) from public,anon,authenticated,service_role;

alter function app_private.reminder_ineligible(public.messages) rename to reminder_ineligible_base;
create function app_private.reminder_ineligible(m public.messages) returns text language plpgsql stable security definer set search_path='' as $$
declare reason text; c public.clients; e jsonb;
begin
 reason:=app_private.reminder_ineligible_base(m);
 if reason is not null then return reason; end if;
 select cl.* into c from public.clients cl join public.appointments a on a.client_id=cl.id where a.id=m.appointment_id;
 if exists(select 1 from app_private.reminder_suppressions s where s.tenant_id=m.tenant_id and s.email=lower(btrim(c.email))) then return 'recipient_suppressed'; end if;
 if exists(select 1 from app_private.reminder_settings where provider='resend-v1') then
  if app_private.reminder_reply_to(m.tenant_id) is null then return 'sender_not_ready'; end if;
  select d.envelope into e from app_private.reminder_dispatches d where d.message_id=m.id;
  if e is not null and e->>'version'<>'glow-reminder-v2' then return 'legacy_envelope'; end if;
 end if;
 return null;
end;
$$;
revoke all on function app_private.reminder_ineligible(public.messages) from public,anon,authenticated,service_role;

create or replace function public.begin_reminder_dispatch(p_id uuid,p_claim uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.messages; d app_private.reminder_dispatches; a public.appointments; t public.tenants; c public.clients; reason text; frozen jsonb;
begin
 perform 1 from public.tenants locked_tenant join public.messages msg on msg.tenant_id=locked_tenant.id where msg.id=p_id for update of locked_tenant;
 perform 1 from public.appointments locked_appointment join public.messages msg on msg.appointment_id=locked_appointment.id where msg.id=p_id for update of locked_appointment;
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
 -- Freeze all Resend fields on first send; never upgrade an attempted v1.
 if d.envelope is null and exists(select 1 from app_private.reminder_settings where provider='resend-v1') then
  frozen:=frozen||jsonb_build_object('version','glow-reminder-v2','from','Glow <reminder@glowlabs.it>',
   'reply_to',app_private.reminder_reply_to(m.tenant_id));
 end if;
 update app_private.reminder_dispatches set envelope=frozen,first_dispatch_at=coalesce(first_dispatch_at,clock_timestamp()),phase='dispatching' where message_id=p_id;
 update public.messages set attempts=attempts+1,updated_at=clock_timestamp() where id=p_id;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(m.tenant_id,null,'reminder.dispatch','messages',p_id);
 return frozen;
end;
$$;

-- Projection is monotone; in-flight worker keeps its lease until ack/recovery.
create function app_private.apply_reminder_delivery(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.messages m set status=d.delivery_state,provider_id=d.acceptance_id::text,
  failure_code=d.delivery_code,next_attempt_at=null,updated_at=clock_timestamp()
 from app_private.reminder_dispatches d where d.message_id=p_id and m.id=p_id and d.acceptance_id is not null
 and m.status<>'processing';
end;
$$;
revoke all on function app_private.apply_reminder_delivery(uuid) from public,anon,authenticated,service_role;

-- The signature verifier is the only caller. Correlate tag + frozen From/To,
-- first dispatch and provider ID; events for other applications are ignored.
create function public.record_resend_event(p_event_id text,p_message_id uuid,p_provider_id uuid,p_type text,p_created_at timestamptz,p_from text,p_to text,p_suppress boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare m public.messages; d app_private.reminder_dispatches; r integer; state text; code text; inserted integer;
begin
 if p_event_id is null or p_event_id !~ '^[a-zA-Z0-9_-]{1,200}$' or p_provider_id is null or p_created_at is null or p_suppress is null
 or p_type is null or p_type not in('email.sent','email.delivered','email.bounced','email.complained','email.failed','email.suppressed') then raise exception 'INVALID_EVENT' using errcode='22023'; end if;
 perform 1 from public.tenants t join public.messages msg on msg.tenant_id=t.id where msg.id=p_message_id for update of t;
 perform 1 from public.appointments a join public.messages msg on msg.appointment_id=a.id where msg.id=p_message_id for update of a;
 select * into m from public.messages where id=p_message_id for update;
 if not found then return false; end if;
 select * into d from app_private.reminder_dispatches where message_id=p_message_id for update;
 if not found or d.first_dispatch_at is null or d.envelope->>'version' is distinct from 'glow-reminder-v2'
 or p_from is distinct from d.envelope->>'from' or p_to is distinct from d.envelope->>'to'
 or p_created_at<d.first_dispatch_at-interval '5 minutes' or p_created_at>clock_timestamp()+interval '5 minutes'
 or (d.acceptance_id is not null and d.acceptance_id<>p_provider_id)
 or (m.provider_id is not null and m.provider_id<>p_provider_id::text) then return false; end if;
 insert into app_private.resend_events(event_id,message_id,provider_id,type,occurred_at)
 values(p_event_id,p_message_id,p_provider_id,p_type,p_created_at) on conflict(event_id) do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return true; end if;
 r:=case p_type when 'email.sent' then 1 when 'email.delivered' then 2 when 'email.failed' then 3 when 'email.bounced' then 4 when 'email.suppressed' then 5 else 6 end;
 state:=case p_type when 'email.sent' then 'accepted' when 'email.delivered' then 'delivered' when 'email.bounced' then 'bounced' else 'failed' end;
 code:=case p_type when 'email.bounced' then 'provider_bounced' when 'email.failed' then 'provider_failed' when 'email.complained' then 'provider_complained' when 'email.suppressed' then 'provider_suppressed' else null end;
 update app_private.reminder_dispatches set acceptance_id=p_provider_id,
 delivery_rank=greatest(delivery_rank,r),delivery_state=case when r>delivery_rank then state else delivery_state end,
 delivery_code=case when r>delivery_rank then code else delivery_code end where message_id=p_message_id;
 if p_suppress and p_type in('email.bounced','email.complained','email.suppressed') then
  insert into app_private.reminder_suppressions(tenant_id,email,reason) values(m.tenant_id,lower(btrim(p_to)),p_type)
  on conflict(tenant_id,email) do nothing;
 end if;
 perform app_private.apply_reminder_delivery(p_message_id);
 insert into public.audit_log(tenant_id,action,resource_type,resource_id) values(m.tenant_id,'reminder.'||p_type,'messages',m.id);
 return true;
end;
$$;
revoke all on function public.record_resend_event(text,uuid,uuid,text,timestamptz,text,text,boolean) from public,anon,authenticated;
grant execute on function public.record_resend_event(text,uuid,uuid,text,timestamptz,text,text,boolean) to service_role;

-- No provider API claims to look up an idempotency key. Signed local evidence
-- can prove acceptance; its absence can NEVER authorize a new send.
create function public.lookup_reminder_acceptance(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select case when d.acceptance_id is not null then jsonb_build_object('kind','accepted','providerId',d.acceptance_id::text)
 else jsonb_build_object('kind','unknown') end from app_private.reminder_dispatches d where d.message_id=p_id;
$$;
revoke all on function public.lookup_reminder_acceptance(uuid) from public,anon,authenticated;
grant execute on function public.lookup_reminder_acceptance(uuid) to service_role;

alter function public.finish_reminder(uuid,uuid,text,text) set schema app_private;
alter function app_private.finish_reminder(uuid,uuid,text,text) rename to finish_reminder_base;
revoke all on function app_private.finish_reminder_base(uuid,uuid,text,text) from public,anon,authenticated,service_role;
create function public.finish_reminder(p_id uuid,p_claim uuid,p_result text,p_provider_id text default null) returns void language plpgsql security definer set search_path='' as $$
declare d app_private.reminder_dispatches;
begin
 perform 1 from public.tenants t join public.messages msg on msg.tenant_id=t.id where msg.id=p_id for update of t;
 perform 1 from public.appointments a join public.messages msg on msg.appointment_id=a.id where msg.id=p_id for update of a;
 perform 1 from public.messages where id=p_id for update;
 select * into d from app_private.reminder_dispatches where message_id=p_id for update;
 if d.claim=p_claim and d.acceptance_id is not null then
  if p_result='accepted' and p_provider_id is distinct from d.acceptance_id::text then raise exception 'PROVIDER_MISMATCH' using errcode='22023'; end if;
  perform app_private.finish_reminder_base(p_id,p_claim,'accepted',d.acceptance_id::text);
 else
  perform app_private.finish_reminder_base(p_id,p_claim,p_result,p_provider_id);
 end if;
 perform app_private.apply_reminder_delivery(p_id);
end;
$$;
revoke all on function public.finish_reminder(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_reminder(uuid,uuid,text,text) to service_role;

-- Minimal owner settings; switching on only queues newly scheduled/edited work.
-- Never backfill old appointments or expose privileged delivery controls.
create function public.reminder_preferences(p_enabled boolean default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=app_private.current_tenant_id(); reply_to text; enabled boolean;
begin
 perform 1 from public.tenants where id=tenant for update;
 if tenant is null or not app_private.is_owner() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 reply_to:=app_private.reminder_reply_to(tenant);
 if p_enabled is not null then
  if p_enabled and reply_to is null then raise exception 'SENDER_NOT_READY' using errcode='22023'; end if;
  update public.tenants set reminders_enabled=p_enabled where id=tenant;
  insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(tenant,auth.uid(),'reminder.preferences','tenants',tenant);
 end if;
 select reminders_enabled into enabled from public.tenants where id=tenant;
 return jsonb_build_object('enabled',enabled,'from','Glow <reminder@glowlabs.it>','reply_to',reply_to,'reply_to_verified',reply_to is not null,
 'delivery_enabled',(select s.enabled from app_private.reminder_settings s),'template','glow-reminder-v2','hours_before',24);
end;
$$;
revoke all on function public.reminder_preferences(boolean) from public,anon;
grant execute on function public.reminder_preferences(boolean) to authenticated;

create or replace function public.reminder_worker_health(p_persist boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare enabled boolean; successful timestamptz; failed_at timestamptz; started timestamptz; warnings jsonb:='[]'; item jsonb;
 lag integer; uncertain integer; failed integer; stale boolean; broken boolean;
begin
 if p_persist then perform pg_advisory_xact_lock(hashtextextended('glow:reminder-monitor',0)); end if;
 select s.enabled into enabled from app_private.reminder_settings s;
 select max(finished_at) filter(where status='completed'),max(finished_at) filter(where status='failed'),max(started_at) into successful,failed_at,started from app_private.reminder_runs;
 select count(*)::int into lag from public.messages where status='queued' and coalesce(next_attempt_at,scheduled_for)<clock_timestamp()-interval '5 minutes';
 select count(*)::int into uncertain from public.messages where status='uncertain' or (status='processing' and exists(select 1 from app_private.reminder_dispatches d where d.message_id=messages.id and d.lease_until<clock_timestamp() and d.phase in('dispatching','reconciling')));
 select count(*)::int into failed from public.messages where status in('failed','bounced');
 stale:=successful is null or successful<clock_timestamp()-interval '5 minutes';
 broken:=failed_at is not null and (successful is null or failed_at>successful);
 if enabled then
  if stale then warnings:=warnings||jsonb_build_array(jsonb_build_object('kind','worker_stale','affected',1)); end if;
  if lag>0 then warnings:=warnings||jsonb_build_array(jsonb_build_object('kind','queue_lag','affected',lag)); end if;
  if uncertain>0 then warnings:=warnings||jsonb_build_array(jsonb_build_object('kind','uncertain','affected',uncertain)); end if;
  if failed>0 then warnings:=warnings||jsonb_build_array(jsonb_build_object('kind','failed','affected',failed)); end if;
  if broken then warnings:=warnings||jsonb_build_array(jsonb_build_object('kind','worker_failed','affected',1)); end if;
 end if;
 if p_persist then
  for item in select value from jsonb_array_elements(warnings) loop
   insert into app_private.reminder_alerts(kind,affected) values(item->>'kind',(item->>'affected')::integer)
   on conflict(kind) do update set affected=excluded.affected,last_seen_at=clock_timestamp(),resolved_at=null,
   first_seen_at=case when reminder_alerts.resolved_at is null then reminder_alerts.first_seen_at else clock_timestamp() end;
  end loop;
  update app_private.reminder_alerts set resolved_at=clock_timestamp(),affected=0 where resolved_at is null and not exists(select 1 from jsonb_array_elements(warnings) x where x->>'kind'=reminder_alerts.kind);
 end if;
 return jsonb_build_object('mode',case when enabled then 'enabled' else 'disabled' end,'status',case when jsonb_array_length(warnings)>0 then 'degraded' else 'ok' end,
 'last_success_at',successful,'last_started_at',started,'warnings',warnings,'counts',jsonb_build_object('queue_lag',lag,'uncertain',uncertain,'failed',failed));
end;
$$;


-- Include expired in-flight work in owner health; spread bounded retries.
create or replace function public.reminder_tenant_health() returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=app_private.current_tenant_id(); enabled boolean; heartbeat timestamptz; queued integer; unknown integer; failed integer;
begin
 if tenant is null or not app_private.is_owner() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select s.enabled into enabled from app_private.reminder_settings s;
 select max(finished_at) into heartbeat from app_private.reminder_runs where status='completed';
 select count(*) filter(where status='queued')::int,count(*) filter(where status='uncertain' or (status='processing' and exists(select 1 from app_private.reminder_dispatches d where d.message_id=messages.id and d.lease_until<clock_timestamp() and d.phase in('dispatching','reconciling'))))::int,count(*) filter(where status in('failed','bounced'))::int
 into queued,unknown,failed from public.messages where tenant_id=tenant;
 return jsonb_build_object('mode',case when enabled then 'enabled' else 'disabled' end,'status',case when enabled and (heartbeat is null or heartbeat<clock_timestamp()-interval '5 minutes' or unknown>0 or failed>0 or exists(select 1 from public.messages where tenant_id=tenant and status='queued' and coalesce(next_attempt_at,scheduled_for)<clock_timestamp()-interval '5 minutes')) then 'degraded' else 'ok' end,
 'last_success_at',heartbeat,'counts',jsonb_build_object('queued',queued,'uncertain',unknown,'failed',failed));
end;
$$;

