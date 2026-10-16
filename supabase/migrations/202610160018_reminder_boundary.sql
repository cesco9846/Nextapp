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
 update app_private.reminder_dispatches set envelope=frozen,first_dispatch_at=coalesce(first_dispatch_at,clock_timestamp()),phase='dispatching' where message_id=p_id;
 update public.messages set attempts=attempts+1,updated_at=clock_timestamp() where id=p_id;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(m.tenant_id,null,'reminder.dispatch','messages',p_id);
 return frozen;
end;
$$;
