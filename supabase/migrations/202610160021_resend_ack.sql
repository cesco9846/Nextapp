-- Preserve idempotent acknowledgement after signed evidence overrides an uncertain HTTP result.
create or replace function public.finish_reminder(p_id uuid,p_claim uuid,p_result text,p_provider_id text default null) returns void language plpgsql security definer set search_path='' as $$
declare d app_private.reminder_dispatches;
begin
 perform 1 from public.tenants t join public.messages msg on msg.tenant_id=t.id where msg.id=p_id for update of t;
 perform 1 from public.appointments a join public.messages msg on msg.appointment_id=a.id where msg.id=p_id for update of a;
 perform 1 from public.messages where id=p_id for update;
 select * into d from app_private.reminder_dispatches where message_id=p_id for update;
 if p_result is null or p_result not in('accepted','retryable','rejected','unknown','absent') or (p_result<>'accepted' and p_provider_id is not null) then raise exception 'INVALID_RESULT' using errcode='22023'; end if;
 if (d.claim=p_claim or (d.last_claim=p_claim and d.last_result='accepted')) and d.acceptance_id is not null then
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

