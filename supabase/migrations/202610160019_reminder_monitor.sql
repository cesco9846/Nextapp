-- Include expired in-flight work in owner health; spread bounded retries.
create or replace function public.reminder_tenant_health() returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=app_private.current_tenant_id(); enabled boolean; heartbeat timestamptz; queued integer; unknown integer; failed integer;
begin
 if tenant is null or not app_private.is_owner() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select s.enabled into enabled from app_private.reminder_settings s;
 select max(finished_at) into heartbeat from app_private.reminder_runs where status='completed';
 select count(*) filter(where status='queued')::int,count(*) filter(where status='uncertain' or (status='processing' and exists(select 1 from app_private.reminder_dispatches d where d.message_id=messages.id and d.lease_until<clock_timestamp() and d.phase in('dispatching','reconciling'))))::int,count(*) filter(where status='failed')::int
 into queued,unknown,failed from public.messages where tenant_id=tenant;
 return jsonb_build_object('mode',case when enabled then 'enabled' else 'disabled' end,'status',case when enabled and (heartbeat is null or heartbeat<clock_timestamp()-interval '5 minutes' or unknown>0 or failed>0 or exists(select 1 from public.messages where tenant_id=tenant and status='queued' and coalesce(next_attempt_at,scheduled_for)<clock_timestamp()-interval '5 minutes')) then 'degraded' else 'ok' end,
 'last_success_at',heartbeat,'counts',jsonb_build_object('queued',queued,'uncertain',unknown,'failed',failed));
end;
$$;

create or replace function public.finish_reminder(p_id uuid,p_claim uuid,p_result text,p_provider_id text default null) returns void language plpgsql security definer set search_path='' as $$
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
  if d.reconcile_attempts<6 then retry_at:=clock_timestamp()+make_interval(secs=>least(1800,60*(2^d.reconcile_attempts)::integer)+(random()*15)::integer); end if;
 else
  reason:=app_private.reminder_ineligible(m);
  if reason is not null then state:=case when reason='stale_schedule' then 'cancelled' else 'skipped' end;
  elsif m.attempts>=5 then state:='failed';reason:='attempts_exhausted';
  else state:='queued';reason:='provider_retryable';retry_at:=clock_timestamp()+make_interval(secs=>least(900,30*(2^m.attempts)::integer)+(random()*15)::integer);
  end if;
 end if;
 update public.messages set status=state,failure_code=reason,provider_id=case when state='accepted' then p_provider_id else provider_id end,next_attempt_at=retry_at,updated_at=clock_timestamp() where id=p_id;
 update app_private.reminder_dispatches set claim=null,lease_until=null,phase=null,last_claim=p_claim,last_result=p_result,last_provider_id=p_provider_id where message_id=p_id;
 if state='accepted' then update app_private.reminder_runs set accepted=accepted+1 where id=d.run_id; end if;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(m.tenant_id,null,'reminder.'||state,'messages',p_id);
end;
$$;
