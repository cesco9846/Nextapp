-- W15: delivery is OFF until W16 configures a real provider and its scheduler.
alter table public.messages add column failure_code text check(failure_code in(
 'provider_retryable','provider_rejected','attempts_exhausted','provider_unknown','worker_interrupted',
 'stale_schedule','delivery_window_expired','no_recipient','recipient_changed'));
alter table public.messages add column cancellation_requested_at timestamptz;
create index messages_retry on public.messages(coalesce(next_attempt_at,scheduled_for),id) where status in('queued','uncertain','processing');
create table app_private.reminder_settings (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false,
 provider text not null default 'resend-v1' check(provider in('resend-v1','test-v1'))
);
insert into app_private.reminder_settings(singleton) values(true);
create table app_private.reminder_runs (
 id uuid primary key, provider text not null, started_at timestamptz not null default clock_timestamp(),
 finished_at timestamptz, status text not null default 'running' check(status in('running','completed','failed')),
 claimed integer not null default 0, accepted integer not null default 0
);
create table app_private.reminder_dispatches (
 message_id uuid primary key references public.messages(id), run_id uuid references app_private.reminder_runs(id),
 claim uuid, lease_until timestamptz, phase text check(phase in('claimed','dispatching','reconciling')),
 envelope jsonb, first_dispatch_at timestamptz, reconcile_attempts integer not null default 0,
 last_claim uuid, last_result text, last_provider_id text,
 check((claim is null)=(lease_until is null)),check((claim is null)=(phase is null))
);
create index reminder_expired_lease on app_private.reminder_dispatches(lease_until) where claim is not null;
create table app_private.reminder_alerts (
 kind text primary key check(kind in('worker_stale','queue_lag','uncertain','failed','worker_failed')),
 affected integer not null, first_seen_at timestamptz not null default clock_timestamp(),
 last_seen_at timestamptz not null default clock_timestamp(), resolved_at timestamptz
);
alter table app_private.reminder_settings enable row level security;
alter table app_private.reminder_runs enable row level security;
alter table app_private.reminder_dispatches enable row level security;
alter table app_private.reminder_alerts enable row level security;
revoke all on app_private.reminder_settings,app_private.reminder_runs,app_private.reminder_dispatches,app_private.reminder_alerts from public,anon,authenticated,service_role;

-- An edit can stop an unstarted dispatch. An external request already crossing
-- the dispatch boundary cannot be recalled: preserve that fact until reconciled.
create or replace function app_private.sync_reminder(p_appointment public.appointments) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.messages m set cancellation_requested_at=clock_timestamp(),updated_at=clock_timestamp(),
 status=case when m.status='uncertain' or exists(select 1 from app_private.reminder_dispatches d where d.message_id=m.id and d.phase in('dispatching','reconciling')) then m.status else 'cancelled' end
 where m.appointment_id=p_appointment.id and m.status in('queued','processing','uncertain')
 and (m.schedule_revision<>p_appointment.schedule_revision or p_appointment.status not in('booked','confirmed'));
 if p_appointment.status in('booked','confirmed') and p_appointment.starts_at-interval '24 hours'>clock_timestamp()
 and exists(select 1 from public.tenants where id=p_appointment.tenant_id and reminders_enabled)
 and exists(select 1 from public.clients where id=p_appointment.client_id and email is not null and archived_at is null) then
  insert into public.messages(tenant_id,appointment_id,schedule_revision,kind,scheduled_for)
  values(p_appointment.tenant_id,p_appointment.id,p_appointment.schedule_revision,'reminder_24h',p_appointment.starts_at-interval '24 hours')
  on conflict(appointment_id,schedule_revision,kind,channel) do nothing;
 end if;
end;
$$;

create function app_private.reminder_ineligible(m public.messages) returns text language plpgsql stable security definer set search_path='' as $$
declare a public.appointments; c public.clients; t public.tenants; envelope jsonb;
begin
 select * into a from public.appointments where id=m.appointment_id;
 select * into t from public.tenants where id=m.tenant_id;
 select * into c from public.clients where id=a.client_id;
 if not t.reminders_enabled or a.status not in('booked','confirmed') or a.schedule_revision<>m.schedule_revision or m.cancellation_requested_at is not null then return 'stale_schedule'; end if;
 if clock_timestamp()>=least(a.starts_at,m.scheduled_for+interval '2 hours') then return 'delivery_window_expired'; end if;
 if c.archived_at is not null or c.email is null or c.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return 'no_recipient'; end if;
 select d.envelope into envelope from app_private.reminder_dispatches d where d.message_id=m.id;
 if envelope is not null and envelope->>'to' is distinct from c.email then return 'recipient_changed'; end if;
 return null;
end;
$$;
revoke all on function app_private.reminder_ineligible(public.messages) from public,anon,authenticated,service_role;

create function public.start_reminder_run(p_id uuid,p_provider text) returns boolean language plpgsql security definer set search_path='' as $$
declare config app_private.reminder_settings;
begin
 select * into config from app_private.reminder_settings;
 if not config.enabled then return false; end if;
 if p_id is null or p_provider is distinct from config.provider then raise exception 'PROVIDER_NOT_READY' using errcode='22023'; end if;
 insert into app_private.reminder_runs(id,provider) values(p_id,p_provider);
 return true;
end;
$$;
create function public.finish_reminder_run(p_id uuid,p_ok boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_ok is null then raise exception 'INVALID_RUN' using errcode='22023'; end if;
 update app_private.reminder_runs set status=case when p_ok then 'completed' else 'failed' end,finished_at=clock_timestamp() where id=p_id and status='running';
end;
$$;

create function public.claim_reminder(p_run uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare candidate record; m public.messages; d app_private.reminder_dispatches; run app_private.reminder_runs;
 token uuid; reason text; action text;
begin
 select * into run from app_private.reminder_runs where id=p_run and status='running';
 if not found or run.started_at<clock_timestamp()-interval '2 minutes' then raise exception 'INVALID_RUN' using errcode='22023'; end if;
 if not exists(select 1 from app_private.reminder_settings where enabled and provider=run.provider) then return null; end if;
 for candidate in
  select msg.id,msg.tenant_id,msg.appointment_id from public.messages msg left join app_private.reminder_dispatches x on x.message_id=msg.id
  where (msg.status='queued' and coalesce(msg.next_attempt_at,msg.scheduled_for)<=clock_timestamp())
  or (msg.status='uncertain' and msg.next_attempt_at<=clock_timestamp())
  or (msg.status='processing' and x.lease_until<=clock_timestamp())
  order by coalesce(msg.next_attempt_at,msg.scheduled_for),msg.id limit 50
 loop
  -- Same tenant -> appointment -> message order as appointment mutations.
  perform 1 from public.tenants where id=candidate.tenant_id for update skip locked;
  if not found then continue; end if;
  perform 1 from public.appointments where id=candidate.appointment_id for update skip locked;
  if not found then continue; end if;
  select * into m from public.messages where id=candidate.id for update skip locked;
  if not found then continue; end if;
  select * into d from app_private.reminder_dispatches where message_id=m.id for update;
  if m.status='processing' then
   if d.lease_until>clock_timestamp() then continue; end if;
   if d.phase in('dispatching','reconciling') then
    update public.messages set status='uncertain',failure_code='worker_interrupted',next_attempt_at=clock_timestamp() where id=m.id returning * into m;
   else update public.messages set status='queued' where id=m.id returning * into m;
   end if;
  end if;
  if m.status not in('queued','uncertain') or (m.status='uncertain' and (m.next_attempt_at is null or d.reconcile_attempts>=6))
   or coalesce(m.next_attempt_at,m.scheduled_for)>clock_timestamp() then continue; end if;
  action:=case when m.status='uncertain' then 'reconcile' else 'send' end;
  if action='send' then
   reason:=app_private.reminder_ineligible(m);
   if reason is not null or m.attempts>=5 then
    update public.messages set status=case when reason='stale_schedule' then 'cancelled' when reason is not null then 'skipped' else 'failed' end,
    failure_code=coalesce(reason,'attempts_exhausted'),next_attempt_at=null,updated_at=clock_timestamp() where id=m.id;
    update app_private.reminder_dispatches set claim=null,lease_until=null,phase=null where message_id=m.id;
    continue;
   end if;
  end if;
  token:=gen_random_uuid();
  insert into app_private.reminder_dispatches(message_id,run_id,claim,lease_until,phase,reconcile_attempts)
  values(m.id,p_run,token,clock_timestamp()+interval '60 seconds',case when action='send' then 'claimed' else 'reconciling' end,case when action='reconcile' then 1 else 0 end)
  on conflict(message_id) do update set run_id=p_run,claim=token,lease_until=excluded.lease_until,phase=excluded.phase,
  reconcile_attempts=reminder_dispatches.reconcile_attempts+case when action='reconcile' then 1 else 0 end;
  update public.messages set status='processing',updated_at=clock_timestamp() where id=m.id;
  update app_private.reminder_runs set claimed=claimed+1 where id=p_run;
  return jsonb_build_object('id',m.id,'claim',token,'action',action,'key','glow-reminder-v1/'||m.id::text,
  'envelope',case when action='reconcile' then d.envelope else null end);
 end loop;
 return null;
end;
$$;

create function public.begin_reminder_dispatch(p_id uuid,p_claim uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.messages; d app_private.reminder_dispatches; a public.appointments; t public.tenants; c public.clients; reason text; frozen jsonb;
begin
 perform 1 from public.tenants t join public.messages msg on msg.tenant_id=t.id where msg.id=p_id for update of t;
 perform 1 from public.appointments a join public.messages msg on msg.appointment_id=a.id where msg.id=p_id for update of a;
 select * into m from public.messages where id=p_id for update;
 select * into d from app_private.reminder_dispatches where message_id=p_id for update;
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

create function public.finish_reminder(p_id uuid,p_claim uuid,p_result text,p_provider_id text default null) returns void language plpgsql security definer set search_path='' as $$
declare m public.messages; d app_private.reminder_dispatches; reason text; state text; retry_at timestamptz;
begin
 perform 1 from public.tenants t join public.messages msg on msg.tenant_id=t.id where msg.id=p_id for update of t;
 perform 1 from public.appointments a join public.messages msg on msg.appointment_id=a.id where msg.id=p_id for update of a;
 select * into m from public.messages where id=p_id for update;
 select * into d from app_private.reminder_dispatches where message_id=p_id for update;
 if p_result is null or p_result not in('accepted','retryable','rejected','unknown','absent')
 or (p_result='accepted' and (p_provider_id is null or p_provider_id !~ '^[a-zA-Z0-9_-]{1,200}$'))
 or (p_result<>'accepted' and p_provider_id is not null) then raise exception 'INVALID_RESULT' using errcode='22023'; end if;
 if d.last_claim=p_claim then
  if d.last_result=p_result and d.last_provider_id is not distinct from p_provider_id then return; end if;
  raise exception 'IDEMPOTENCY_MISMATCH' using errcode='23505';
 end if;
 if d.claim is distinct from p_claim or d.claim is null or m.status<>'processing' or d.lease_until<=clock_timestamp()
 or d.phase not in('dispatching','reconciling') then raise exception 'STALE_CLAIM' using errcode='40001'; end if;
 if (p_result='absent' and d.phase<>'reconciling') or (p_result='retryable' and d.phase<>'dispatching') then raise exception 'INVALID_RESULT' using errcode='22023'; end if;
 if p_result='accepted' then state:='accepted'; reason:=null;
 elsif p_result='rejected' then state:='failed';reason:='provider_rejected';
 elsif p_result='unknown' then
  state:='uncertain';reason:='provider_unknown';
  if d.reconcile_attempts<6 then retry_at:=clock_timestamp()+make_interval(secs=>least(1800,60*(2^d.reconcile_attempts)::integer)); end if;
 else
  reason:=app_private.reminder_ineligible(m);
  if reason is not null then state:=case when reason='stale_schedule' then 'cancelled' else 'skipped' end;
  elsif m.attempts>=5 then state:='failed';reason:='attempts_exhausted';
  else state:='queued';reason:='provider_retryable';retry_at:=clock_timestamp()+make_interval(secs=>least(900,30*(2^m.attempts)::integer));
  end if;
 end if;
 update public.messages set status=state,failure_code=reason,provider_id=case when state='accepted' then p_provider_id else provider_id end,next_attempt_at=retry_at,updated_at=clock_timestamp() where id=p_id;
 update app_private.reminder_dispatches set claim=null,lease_until=null,phase=null,last_claim=p_claim,last_result=p_result,last_provider_id=p_provider_id where message_id=p_id;
 if state='accepted' then update app_private.reminder_runs set accepted=accepted+1 where id=d.run_id; end if;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(m.tenant_id,null,'reminder.'||state,'messages',p_id);
end;
$$;

create function public.reminder_worker_health(p_persist boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare enabled boolean; successful timestamptz; failed_at timestamptz; started timestamptz; warnings jsonb:='[]'; item jsonb;
 lag integer; uncertain integer; failed integer; stale boolean; broken boolean;
begin
 if p_persist then perform pg_advisory_xact_lock(hashtextextended('glow:reminder-monitor',0)); end if;
 select s.enabled into enabled from app_private.reminder_settings s;
 select max(finished_at) filter(where status='completed'),max(finished_at) filter(where status='failed'),max(started_at) into successful,failed_at,started from app_private.reminder_runs;
 select count(*)::int into lag from public.messages where status='queued' and coalesce(next_attempt_at,scheduled_for)<clock_timestamp()-interval '5 minutes';
 select count(*)::int into uncertain from public.messages where status='uncertain' or (status='processing' and exists(select 1 from app_private.reminder_dispatches d where d.message_id=messages.id and d.lease_until<clock_timestamp() and d.phase in('dispatching','reconciling')));
 select count(*)::int into failed from public.messages where status='failed';
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

create function public.reminder_tenant_health() returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=app_private.current_tenant_id(); enabled boolean; heartbeat timestamptz; queued integer; unknown integer; failed integer;
begin
 if tenant is null or not app_private.is_owner() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select s.enabled into enabled from app_private.reminder_settings s;
 select max(finished_at) into heartbeat from app_private.reminder_runs where status='completed';
 select count(*) filter(where status='queued')::int,count(*) filter(where status='uncertain')::int,count(*) filter(where status='failed')::int
 into queued,unknown,failed from public.messages where tenant_id=tenant;
 return jsonb_build_object('mode',case when enabled then 'enabled' else 'disabled' end,'status',case when enabled and (heartbeat is null or heartbeat<clock_timestamp()-interval '5 minutes' or unknown>0 or failed>0 or exists(select 1 from public.messages where tenant_id=tenant and status='queued' and coalesce(next_attempt_at,scheduled_for)<clock_timestamp()-interval '5 minutes')) then 'degraded' else 'ok' end,
 'last_success_at',heartbeat,'counts',jsonb_build_object('queued',queued,'uncertain',unknown,'failed',failed));
end;
$$;
revoke all on function public.start_reminder_run(uuid,text),public.finish_reminder_run(uuid,boolean),public.claim_reminder(uuid),public.begin_reminder_dispatch(uuid,uuid),public.finish_reminder(uuid,uuid,text,text),public.reminder_worker_health(boolean) from public,anon,authenticated;
grant execute on function public.start_reminder_run(uuid,text),public.finish_reminder_run(uuid,boolean),public.claim_reminder(uuid),public.begin_reminder_dispatch(uuid,uuid),public.finish_reminder(uuid,uuid,text,text),public.reminder_worker_health(boolean) to service_role;
revoke all on function public.reminder_tenant_health() from public,anon;
grant execute on function public.reminder_tenant_health() to authenticated;
