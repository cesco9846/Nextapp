-- Operational metadata only. Never remove messages, dispatch evidence, webhooks,
-- suppressions, audit or clinical records. Activation is a separate cron step.
create index reminder_runs_finished on app_private.reminder_runs(status,finished_at desc,id) where finished_at is not null;
create index reminder_dispatches_run on app_private.reminder_dispatches(run_id) where run_id is not null;
create index reminder_invocations_queued on app_private.reminder_invocations(queued_at);

create function app_private.prune_reminder_logs() returns jsonb
language plpgsql security definer set search_path='' as $$
declare cutoff timestamptz:=statement_timestamp(); pinned uuid[];
 runs_deleted integer; cron_deleted integer; invocations_deleted integer; nonces_deleted integer;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('glow:reminder:retention',0)) then
  return jsonb_build_object('skipped',true);
 end if;
 -- Preserve the heartbeat and failure ordering even after a long suspension.
 select array_remove(array[
  (select id from app_private.reminder_runs where status='completed' and finished_at is not null order by finished_at desc,id limit 1),
  (select id from app_private.reminder_runs where status='failed' and finished_at is not null order by finished_at desc,id limit 1),
  (select id from app_private.reminder_runs order by started_at desc,id limit 1)
 ],null) into pinned;
 with expired as (
  select r.id from app_private.reminder_runs r
  where r.claimed=0 and r.accepted=0 and r.finished_at is not null
  and ((r.status='completed' and r.finished_at<cutoff-interval '7 days')
    or (r.status='failed' and r.finished_at<cutoff-interval '30 days'))
  and not(r.id=any(pinned))
  and not exists(select 1 from app_private.reminder_dispatches d where d.run_id=r.id)
  order by r.finished_at,r.id limit 5000 for update of r skip locked
 ) delete from app_private.reminder_runs r using expired e where r.id=e.id;
 get diagnostics runs_deleted=row_count;

 -- Only the current named Glow jobs, never another application's cron history.
 -- Keep in-flight runs and the latest record for each job, even when paused.
 with expired as (
  select d.runid from cron.job_run_details d join cron.job j on j.jobid=d.jobid
  where j.jobname in('glow-reminder-worker','glow-reminder-monitor','glow-reminder-retention')
  and d.end_time is not null and d.status not in('running','starting','connecting','sending')
  and ((d.status='succeeded' and d.end_time<cutoff-interval '7 days')
    or (d.status<>'succeeded' and d.end_time<cutoff-interval '30 days'))
  and d.runid<>(select max(latest.runid) from cron.job_run_details latest where latest.jobid=d.jobid)
  order by d.end_time,d.runid limit 5000 for update of d skip locked
 ) delete from cron.job_run_details d using expired e where d.runid=e.runid;
 get diagnostics cron_deleted=row_count;

 -- Also enforce existing scheduler/replay retention while dispatch is paused.
 with expired as (
  select id from app_private.reminder_invocations
  where finished_at is not null and queued_at<cutoff-interval '7 days'
  order by queued_at,id limit 5000 for update skip locked
 ) delete from app_private.reminder_invocations i using expired e where i.id=e.id;
 get diagnostics invocations_deleted=row_count;
 with expired as (
  select nonce from app_private.reminder_nonces where consumed_at<cutoff-interval '10 minutes'
  order by consumed_at,nonce limit 5000 for update skip locked
 ) delete from app_private.reminder_nonces n using expired e where n.nonce=e.nonce;
 get diagnostics nonces_deleted=row_count;
 return jsonb_build_object('skipped',false,'worker_runs',runs_deleted,'cron_runs',cron_deleted,
  'invocations',invocations_deleted,'nonces',nonces_deleted);
end;
$$;
revoke all on function app_private.prune_reminder_logs() from public,anon,authenticated,service_role;
