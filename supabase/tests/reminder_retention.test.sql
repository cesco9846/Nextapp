begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select ok(not has_function_privilege('anon','app_private.prune_reminder_logs()','execute'),'anonymous cannot prune operational evidence');
select ok(not has_function_privilege('authenticated','app_private.prune_reminder_logs()','execute'),'studio sessions cannot prune global records');
select ok(not has_function_privilege('service_role','app_private.prune_reminder_logs()','execute'),'retention requires administrative cron access');
select is((select count(*)::int from cron.job where jobname='glow-reminder-retention'),0,'migration does not activate maintenance');

create temporary table fixture(label text primary key,id uuid default gen_random_uuid());
insert into fixture(label) values('expired'),('heartbeat'),('claimed'),('accepted'),('referenced'),('running'),('failed-old'),('failed-latest');
insert into app_private.reminder_runs(id,provider,started_at,finished_at,status,claimed,accepted)
select id,'test-v1',now()-interval '60 days',
 case label when 'heartbeat' then now()-interval '9 days' when 'failed-latest' then now()-interval '31 days' when 'running' then null else now()-interval '50 days' end,
 case when label like 'failed-%' then 'failed' when label='running' then 'running' else 'completed' end,
 case when label='claimed' then 1 else 0 end,case when label='accepted' then 1 else 0 end from fixture;
update app_private.reminder_runs set started_at=now() where id=(select id from fixture where label='running');
update app_private.reminder_settings set enabled=true,provider='test-v1';

-- A real FK protects a run even if its counters happen to be zero.
do $$declare t uuid:=gen_random_uuid();u uuid:=gen_random_uuid();c uuid:=gen_random_uuid();s uuid:=gen_random_uuid();l uuid:=gen_random_uuid();a uuid:=gen_random_uuid();m uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values(u,'retention@example.invalid','{}','{}');
 insert into public.tenants(id,name) values(t,'Retention fixture');
 insert into public.users(id,tenant_id,display_name,role) values(u,t,'Owner fixture','owner');
 insert into public.clients(id,tenant_id,first_name,last_name) values(c,t,'Test','Retention');
 insert into public.services(id,tenant_id,name,duration_minutes) values(s,t,'Test service',60);
 insert into public.locations(id,tenant_id,name) values(l,t,'Test location');
 insert into public.appointments(id,tenant_id,client_id,service_id,operator_id,location_id,service_name,price_cents,starts_at,ends_at)
 values(a,t,c,s,u,l,'Test service',0,now()+interval '2 days',now()+interval '2 days 1 hour');
 insert into public.messages(id,tenant_id,appointment_id,schedule_revision,kind,scheduled_for,status) values(m,t,a,1,'reminder_24h',now(),'uncertain');
 insert into app_private.reminder_dispatches(message_id,run_id) values(m,(select id from fixture where label='referenced'));
end;$$;
create temporary table before_cleanup as select public.reminder_worker_health(false) as health,(select count(*) from public.audit_log) as audits;

select cron.schedule('glow-reminder-worker','0 0 1 1 *','select 1');
select cron.schedule('unrelated-job','0 0 1 1 *','select 1');
insert into cron.job_run_details(runid,jobid,status,start_time,end_time)
select v.id,j.jobid,v.status,now()-v.age,case when v.status='running' then null else now()-v.age end
from cron.job j cross join(values
 (-10::bigint,'succeeded',interval '40 days'), -- latest run ID is kept even after a suspension
 (-20,'succeeded',interval '10 days'),(-21,'failed',interval '40 days'),
 (-22,'succeeded',interval '6 days'),(-23,'running',interval '40 days'),(-24,'failed',interval '29 days')
) v(id,status,age) where j.jobname='glow-reminder-worker';
insert into cron.job_run_details(runid,jobid,status,start_time,end_time)
select -99,jobid,'succeeded',now()-interval '40 days',now()-interval '40 days' from cron.job where jobname='unrelated-job';
insert into app_private.reminder_invocations(id,kind,queued_at,finished_at) values
 (-1,'run',now()-interval '8 days',now()-interval '8 days'),(-2,'monitor',now()-interval '6 days',now()),(-3,'run',now()-interval '8 days',null);
insert into app_private.reminder_nonces(nonce,consumed_at) values(gen_random_uuid(),now()-interval '11 minutes'),(gen_random_uuid(),now()-interval '5 minutes');
create temporary table result as select app_private.prune_reminder_logs() as counts;
select is((select (counts->>'worker_runs')::int from result),2,'only expired empty success/failure records removed');
select is((select (counts->>'cron_runs')::int from result),2,'only expired finished records of Glow jobs removed');
select is((select count(*)::int from app_private.reminder_runs),6,'running, claimed, accepted, referenced and last success/failure retained');
select is(public.reminder_worker_health(false),(select health from before_cleanup),'old heartbeat, last start and failure ordering remain exact');
select is((select count(*) from public.audit_log),(select audits from before_cleanup),'audit evidence preserved');
select is((select count(*)::int from public.messages where status='uncertain'),1,'uncertain outbox message retained');
select is((select count(*)::int from app_private.reminder_dispatches),1,'dispatch and deduplication evidence retained');
select ok(exists(select 1 from cron.job_run_details where runid=-99),'unrelated cron history untouched');
select ok(exists(select 1 from cron.job_run_details where runid=-23),'unfinished cron run retained');
select ok(exists(select 1 from cron.job_run_details where runid=-10),'latest cron run kept after a long suspension');
select is((select (counts->>'invocations')::int from result),1,'seven-day invocation retention preserves recent and pending transport');
select is((select (counts->>'nonces')::int from result),1,'nonce retention exceeds the authentication replay window');
select ok((select enabled from app_private.reminder_settings),'maintenance never disables live reminders');
select ok((select active from cron.job where jobname='glow-reminder-worker'),'maintenance never pauses delivery cron');

-- The normal age windows also preserve recent records that are not pinned.
insert into app_private.reminder_runs(id,provider,status,started_at,finished_at)
values(gen_random_uuid(),'test-v1','completed',now()-interval '6 days',now()-interval '6 days'),
 (gen_random_uuid(),'test-v1','completed',now()-interval '5 days',now()-interval '5 days'),
 (gen_random_uuid(),'test-v1','failed',now()-interval '29 days',now()-interval '29 days'),
 (gen_random_uuid(),'test-v1','failed',now()-interval '28 days',now()-interval '28 days');
select is((app_private.prune_reminder_logs()->>'worker_runs')::int,2,'newer heartbeat replaces the two old pinned empty records');
select is((select count(*)::int from app_private.reminder_runs where finished_at>now()-interval '30 days'),4,'recent unpinned successes and failures preserved');

insert into app_private.reminder_runs(id,provider,status,started_at,finished_at)
select gen_random_uuid(),'test-v1','completed',now()-interval '60 days',now()-interval '60 days' from generate_series(1,5001);
select is((app_private.prune_reminder_logs()->>'worker_runs')::int,5000,'large backlog is cleaned in bounded transactions');
select is((app_private.prune_reminder_logs()->>'worker_runs')::int,1,'next execution drains the remaining backlog');
select is((app_private.prune_reminder_logs()->>'worker_runs')::int,0,'cleanup is repeatable without erasing protected evidence');
select * from finish();
rollback;
