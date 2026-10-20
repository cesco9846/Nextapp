begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
set local role anon;
select throws_ok($$select public.start_maintenance_run('documents',gen_random_uuid())$$,'42501',null,'anonymous callers cannot start maintenance');
select throws_ok($$select public.claim_next_document_job()$$,'42501',null,'anonymous callers cannot claim PDFs');
reset role;
set local role authenticated;
select throws_ok($$select public.maintenance_worker_health(true)$$,'42501',null,'professional sessions cannot inspect global health');
select throws_ok($$select * from app_private.maintenance_runs$$,'42501',null,'global heartbeat rows are private');
reset role;
select is((select count(*)::int from cron.job where jobname in('glow-document-worker','glow-file-cleanup','glow-maintenance-monitor')),0,'migration does not activate cron');
select is(public.start_maintenance_run('documents','aaaaaaaa-1111-4111-8111-111111111111'),'disabled','disabled runner does no work');
select is((select started_at from app_private.maintenance_runs where kind='documents'),null,'disabled invocation does not write a run');
update app_private.maintenance_settings set enabled=true;
select is(public.start_maintenance_run('documents','aaaaaaaa-1111-4111-8111-111111111111'),'started','enabled invocation starts');
select is(public.start_maintenance_run('documents',gen_random_uuid()),'busy','overlapping PDF worker cannot start');
select is(public.start_maintenance_run('cleanup','bbbbbbbb-1111-4111-8111-111111111111'),'started','cleanup is independent');
select is(public.finish_maintenance_run('documents',gen_random_uuid(),true,1,0),false,'wrong run cannot acknowledge');
select is(public.finish_maintenance_run('documents','aaaaaaaa-1111-4111-8111-111111111111',true,1,0),true,'fenced run records aggregate success');
select is(public.finish_maintenance_run('documents','aaaaaaaa-1111-4111-8111-111111111111',false,0,1),false,'duplicate finish cannot replace success');
select is((public.maintenance_worker_health(true)->>'status'),'degraded','missing cleanup heartbeat is visible');
select is((select count(*)::int from app_private.maintenance_alerts where resolved_at is null),1,'monitor persists only the active warning');
select is(public.finish_maintenance_run('cleanup','bbbbbbbb-1111-4111-8111-111111111111',true,0,0),true,'empty healthy run records heartbeat');
select is((public.maintenance_worker_health(true)->>'status'),'ok','both healthy workers resolve warning');
select is((select count(*)::int from app_private.maintenance_alerts where resolved_at is null),0,'warning resolves without deleting evidence');
select public.maintenance_worker_health(true) is not null;
select is((select count(*)::int from app_private.maintenance_runs),2,'polls do not append heartbeat rows');
select is((select count(*)::int from app_private.maintenance_alerts),1,'repeated polls do not append warnings');
select public.start_maintenance_run('cleanup','cccccccc-1111-4111-8111-111111111111');
update app_private.maintenance_runs set lease_until=clock_timestamp()-interval '1 second' where kind='cleanup';
select is(public.finish_maintenance_run('cleanup','cccccccc-1111-4111-8111-111111111111',true,0,0),false,'expired invocation cannot finish');
select is(public.start_maintenance_run('cleanup',gen_random_uuid()),'started','hard interrupted invocation is recoverable');
select throws_ok($$select public.finish_maintenance_run('cleanup',gen_random_uuid(),true,11,0)$$,'22023','INVALID_RUN','bounded counters reject impossible batch');
select throws_ok($$select public.start_maintenance_run('caller-controlled',gen_random_uuid())$$,'22023','INVALID_RUN','kind is fixed');
select throws_ok($$select app_private.enqueue_maintenance_runner('run')$$,'P0001','INVALID_RUNNER','maintenance cannot enqueue reminder delivery');
update app_private.maintenance_settings set enabled=false;
select is(app_private.enqueue_maintenance_runner('documents'),null,'disabled scheduler never sends HTTP');
select cron.schedule('glow-document-worker','0 0 1 1 *','select 1');
select cron.schedule('unrelated-maintenance-test','0 0 1 1 *','select 1');
insert into cron.job_run_details(runid,jobid,status,start_time,end_time)
select v.id,j.jobid,v.status,now()-v.age,case when v.status='running' then null else now()-v.age end
from cron.job j cross join(values
 (-100::bigint,'succeeded',interval '40 days'),
 (-101,'succeeded',interval '8 days'),(-102,'failed',interval '31 days'),
 (-103,'succeeded',interval '6 days'),(-104,'failed',interval '29 days'),(-105,'running',interval '40 days')
) v(id,status,age) where j.jobname='glow-document-worker';
insert into cron.job_run_details(runid,jobid,status,start_time,end_time)
select -199,jobid,'succeeded',now()-interval '40 days',now()-interval '40 days' from cron.job where jobname='unrelated-maintenance-test';
insert into app_private.maintenance_invocations(id,kind,queued_at,finished_at) values
 (-101,'documents',now()-interval '8 days',now()),(-102,'cleanup',now()-interval '6 days',now()),(-103,'cleanup',now()-interval '8 days',null);
create temporary table retained as select app_private.prune_reminder_logs() as result;
select is((select (result->>'maintenance_invocations')::int from retained),1,'only expired finished HTTP metadata is pruned');
select is((select (result->>'cron_runs')::int from retained),2,'seven-day success and thirty-day failure retention extends to new jobs');
select ok(exists(select 1 from cron.job_run_details where runid=-100),'latest maintenance result survives long pause');
select ok(exists(select 1 from cron.job_run_details where runid=-105),'unfinished maintenance evidence retained');
select ok(exists(select 1 from cron.job_run_details where runid=-199),'unrelated cron records are never pruned');
select is((select count(*)::int from app_private.maintenance_invocations),2,'recent and unfinished HTTP requests retained');
select * from finish();
rollback;
