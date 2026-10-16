begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
values
 ('11111111-1111-4111-8111-111111111111','owner-a@example.invalid',now(),'{}','{}'),
 ('22222222-2222-4222-8222-222222222222','owner-b@example.invalid',now(),'{}','{}'),
 ('33333333-3333-4333-8333-333333333333','operator-a@example.invalid',now(),'{}','{}'),
 ('44444444-4444-4444-8444-444444444444','bootstrap@example.invalid',now(),'{}','{}');
insert into public.tenants(id,name,reminders_enabled) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Studio A',true),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Studio B',false);
insert into public.users(id,tenant_id,display_name,role) values
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Owner A','owner'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Owner B','owner'),
 ('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Operator A','operator');
insert into public.locations(id,tenant_id,name) values
 ('aaaaaaaa-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Sede A'),
 ('bbbbbbbb-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Sede B');
insert into public.services(id,tenant_id,name,duration_minutes,price_cents) values
 ('aaaaaaaa-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Servizio A',60,5000),
 ('bbbbbbbb-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Servizio B',60,7000);
insert into public.clients(id,tenant_id,first_name,last_name,email) values
 ('aaaaaaaa-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Cliente','Omonima','test-a@example.invalid'),
 ('aaaaaaaa-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Cliente','Omonima',null),
 ('bbbbbbbb-3333-4333-8333-333333333333','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Cliente','Omonima',null);

create temporary table fixture(label text primary key,data jsonb);
grant all on fixture to authenticated,service_role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select throws_ok($$select public.start_reminder_run(gen_random_uuid(),'test-v1')$$,'42501',null,'owner cannot run global worker');
select throws_ok($$select public.claim_reminder(gen_random_uuid())$$,'42501',null,'owner cannot claim email work');
select throws_ok($$select * from app_private.reminder_dispatches$$,'42501',null,'recipient snapshots are private even to owner');
select is(public.reminder_tenant_health()->>'mode','disabled','owner sees disabled delivery');
reset role;
select is(public.start_reminder_run(gen_random_uuid(),'test-v1'),false,'master switch defaults OFF');
select is((select count(*)::int from app_private.reminder_runs),0,'disabled worker does not create fake heartbeat');
update app_private.reminder_settings set enabled=true,provider='test-v1';
select throws_ok($$select public.start_reminder_run(gen_random_uuid(),'resend-v1')$$,'22023',null,'mismatched provider cannot start');
insert into fixture values('run',to_jsonb(gen_random_uuid()));
select is(public.start_reminder_run((select trim('"' from data::text)::uuid from fixture where label='run'),'test-v1'),true,'ready test provider starts a run');
create function pg_temp.claim() returns jsonb language sql as $$select public.claim_reminder((select trim('"' from data::text)::uuid from fixture where label='run'));$$;
create function pg_temp.new_message(n integer) returns uuid language plpgsql as $$
declare a public.appointments; m uuid;
begin
 a:=public.create_appointment(gen_random_uuid(),jsonb_build_object('client_id','aaaaaaaa-3333-4333-8333-333333333333','service_id','aaaaaaaa-2222-4222-8222-222222222222','location_id','aaaaaaaa-1111-4111-8111-111111111111','operator_id','11111111-1111-4111-8111-111111111111','starts_at',clock_timestamp()+interval '3 days'+n*interval '3 hours','ends_at',clock_timestamp()+interval '3 days 1 hour'+n*interval '3 hours','price_cents',5000));
 update public.messages set scheduled_for=clock_timestamp()-interval '1 minute' where appointment_id=a.id returning id into m;
 return m;
end;
$$;
insert into fixture values('first',to_jsonb(pg_temp.new_message(1)));
insert into fixture values('claim',pg_temp.claim());
select is((select data->>'action' from fixture where label='claim'),'send','due message claimed for initial send');
select is(pg_temp.claim(),null,'active lease cannot be claimed twice');
select is((select attempts from public.messages where id=(select (data->>'id')::uuid from fixture where label='claim')),0,'claim is not a submission attempt');
select ok((select data->'envelope'='null'::jsonb from fixture where label='claim'),'claim reveals no recipient before final check');
-- Cancellation before dispatch is a normal non-send, not a worker failure.
select public.update_appointment((select appointment_id from public.messages where id=(select (data->>'id')::uuid from fixture where label='claim')),1,'{"status":"cancelled"}');
select is(public.begin_reminder_dispatch((select (data->>'id')::uuid from fixture where label='claim'),(select (data->>'claim')::uuid from fixture where label='claim')),null,'committed cancellation prevents provider handoff');
select is((select status from public.messages where id=(select (data->>'id')::uuid from fixture where label='claim')),'cancelled','unstarted work is cancelled');
insert into fixture values('second',to_jsonb(pg_temp.new_message(2)));
update fixture set data=pg_temp.claim() where label='claim';
insert into fixture values('envelope',public.begin_reminder_dispatch((select (data->>'id')::uuid from fixture where label='claim'),(select (data->>'claim')::uuid from fixture where label='claim')));
select is((select data->>'to' from fixture where label='envelope'),'test-a@example.invalid','current recipient frozen at dispatch');
select ok((select not(data::text like '%Servizio A%') and not(data::text like '%Cliente%') from fixture where label='envelope'),'envelope contains no service or client name');
select is((select attempts from public.messages where id=(select (data->>'id')::uuid from fixture where label='claim')),1,'dispatch increments attempts');
select public.finish_reminder((select (data->>'id')::uuid from fixture where label='claim'),(select (data->>'claim')::uuid from fixture where label='claim'),'retryable');
select is((select status from public.messages where id=(select (data->>'id')::uuid from fixture where label='claim')),'queued','proven non-acceptance permits retry');
select is(pg_temp.claim(),null,'backoff prevents an immediate retry');
update public.messages set next_attempt_at=clock_timestamp()-interval '1 second' where id=(select (data->>'id')::uuid from fixture where label='claim');
insert into fixture values('prior', (select data from fixture where label='claim'));
update fixture set data=pg_temp.claim() where label='claim';
select is((select data->>'key' from fixture where label='claim'),(select data->>'key' from fixture where label='prior'),'idempotency key survives retry');
select throws_ok($$select public.begin_reminder_dispatch((select (data->>'id')::uuid from fixture where label='prior'),(select (data->>'claim')::uuid from fixture where label='prior'))$$,'40001',null,'old fencing token cannot dispatch');
update public.tenants set name='Changed studio name' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(public.begin_reminder_dispatch((select (data->>'id')::uuid from fixture where label='claim'),(select (data->>'claim')::uuid from fixture where label='claim')),(select data from fixture where label='envelope'),'payload remains identical across a studio edit');
select public.finish_reminder((select (data->>'id')::uuid from fixture where label='claim'),(select (data->>'claim')::uuid from fixture where label='claim'),'unknown');
select is((select status from public.messages where id=(select (data->>'id')::uuid from fixture where label='claim')),'uncertain','lost provider response is uncertain');
update public.messages set next_attempt_at=clock_timestamp()-interval '1 second' where id=(select (data->>'id')::uuid from fixture where label='claim');
update fixture set data=pg_temp.claim() where label='claim';
select is((select data->>'action' from fixture where label='claim'),'reconcile','uncertainty is looked up, never blindly resent');
select throws_ok($$select public.begin_reminder_dispatch((select (data->>'id')::uuid from fixture where label='claim'),(select (data->>'claim')::uuid from fixture where label='claim'))$$,'40001',null,'lookup claim cannot submit email');
select public.finish_reminder((select (data->>'id')::uuid from fixture where label='claim'),(select (data->>'claim')::uuid from fixture where label='claim'),'accepted','provider-123');
select lives_ok($$select public.finish_reminder((select (data->>'id')::uuid from fixture where label='claim'),(select (data->>'claim')::uuid from fixture where label='claim'),'accepted','provider-123')$$,'acknowledgement retry is idempotent');
select throws_ok($$select public.finish_reminder((select (data->>'id')::uuid from fixture where label='claim'),(select (data->>'claim')::uuid from fixture where label='claim'),'rejected')$$,'23505',null,'ack retry binds the same outcome');
select is((select status from public.messages where id=(select (data->>'id')::uuid from fixture where label='claim')),'accepted','acceptance is not labelled delivered');
select is((select accepted from app_private.reminder_runs),1,'duplicate ack counts one acceptance');
-- Crash before dispatch: lease reclaimed, no provider attempt consumed.
insert into fixture values('third',to_jsonb(pg_temp.new_message(3)));
update fixture set data=pg_temp.claim() where label='claim';
update app_private.reminder_dispatches set lease_until=clock_timestamp()-interval '1 second' where message_id=(select (data->>'id')::uuid from fixture where label='claim');
update fixture set data=pg_temp.claim() where label='claim';
select is((select data->>'action' from fixture where label='claim'),'send','crash before handoff can be retried');
select is((select attempts from public.messages where id=(select (data->>'id')::uuid from fixture where label='claim')),0,'crash before handoff did not count a send');
select public.begin_reminder_dispatch((select (data->>'id')::uuid from fixture where label='claim'),(select (data->>'claim')::uuid from fixture where label='claim'));
-- Crash after boundary and cancellation: reconcile the historical request.
select public.update_appointment((select appointment_id from public.messages where id=(select (data->>'id')::uuid from fixture where label='claim')),1,'{"status":"cancelled"}');
select is((select status from public.messages where id=(select (data->>'id')::uuid from fixture where label='claim')),'processing','cancel cannot claim an in-flight email was recalled');
select ok((select cancellation_requested_at is not null from public.messages where id=(select (data->>'id')::uuid from fixture where label='claim')),'in-flight cancellation is recorded');
update app_private.reminder_dispatches set lease_until=clock_timestamp()-interval '1 second' where message_id=(select (data->>'id')::uuid from fixture where label='claim');
update fixture set data=pg_temp.claim() where label='claim';
select is((select data->>'action' from fixture where label='claim'),'reconcile','crash after boundary does not cause a second send');
select public.finish_reminder((select (data->>'id')::uuid from fixture where label='claim'),(select (data->>'claim')::uuid from fixture where label='claim'),'absent');
select is((select status from public.messages where id=(select (data->>'id')::uuid from fixture where label='claim')),'cancelled','authoritative non-acceptance completes cancellation');
-- Frozen recipient must not be reused after contact changes.
insert into fixture values('fourth',to_jsonb(pg_temp.new_message(4)));
update fixture set data=pg_temp.claim() where label='claim';
select public.begin_reminder_dispatch((select (data->>'id')::uuid from fixture where label='claim'),(select (data->>'claim')::uuid from fixture where label='claim'));
select public.finish_reminder((select (data->>'id')::uuid from fixture where label='claim'),(select (data->>'claim')::uuid from fixture where label='claim'),'retryable');
update public.clients set email='changed@example.invalid' where id='aaaaaaaa-3333-4333-8333-333333333333';
update public.messages set next_attempt_at=clock_timestamp()-interval '1 second' where id=(select (data->>'id')::uuid from fixture where label='claim');
select is(pg_temp.claim(),null,'changed recipient blocks old payload retry');
select is((select failure_code from public.messages where id=(select (data->>'id')::uuid from fixture where label='claim')),'recipient_changed','changed recipient has explicit reason');
-- Five proven refusals exhaust delivery; six unknown lookups require attention.
insert into fixture values('exhaust',to_jsonb(pg_temp.new_message(5)));
do $$declare j jsonb;begin for i in 1..5 loop j:=pg_temp.claim();perform public.begin_reminder_dispatch((j->>'id')::uuid,(j->>'claim')::uuid);perform public.finish_reminder((j->>'id')::uuid,(j->>'claim')::uuid,'retryable');update public.messages set next_attempt_at=clock_timestamp()-interval '1 second' where id=(j->>'id')::uuid and status='queued';end loop;end;$$;
select is((select status from public.messages where id=(select trim('"' from data::text)::uuid from fixture where label='exhaust')),'failed','bounded send attempts reach terminal failure');
insert into fixture values('unknown',to_jsonb(pg_temp.new_message(6)));
update fixture set data=pg_temp.claim() where label='claim';
select public.begin_reminder_dispatch((select (data->>'id')::uuid from fixture where label='claim'),(select (data->>'claim')::uuid from fixture where label='claim'));
select public.finish_reminder((select (data->>'id')::uuid from fixture where label='claim'),(select (data->>'claim')::uuid from fixture where label='claim'),'unknown');
do $$declare j jsonb;begin for i in 1..6 loop update public.messages set next_attempt_at=clock_timestamp()-interval '1 second' where id=(select trim('"' from data::text)::uuid from fixture where label='unknown');j:=pg_temp.claim();perform public.finish_reminder((j->>'id')::uuid,(j->>'claim')::uuid,'unknown');end loop;end;$$;
select is(pg_temp.claim(),null,'uncertain lookup budget does not loop forever');
select is((select next_attempt_at from public.messages where id=(select trim('"' from data::text)::uuid from fixture where label='unknown')),null,'uncertain remains visible for manual investigation');
select is((select attempts from public.messages where id=(select trim('"' from data::text)::uuid from fixture where label='unknown')),1,'six lookups did not cause another send');

insert into fixture values('expired',to_jsonb(pg_temp.new_message(7)));
update public.messages set scheduled_for=clock_timestamp()-interval '3 hours' where id=(select trim('"' from data::text)::uuid from fixture where label='expired');
select is(pg_temp.claim(),null,'missed delivery window is not sent late');
select is((select failure_code from public.messages where id=(select trim('"' from data::text)::uuid from fixture where label='expired')),'delivery_window_expired','two-hour catch-up window is explicit');
insert into fixture values('no-email',to_jsonb(pg_temp.new_message(8)));
update public.clients set email=null where id='aaaaaaaa-3333-4333-8333-333333333333';
select is(pg_temp.claim(),null,'missing current recipient prevents send');
select is((select failure_code from public.messages where id=(select trim('"' from data::text)::uuid from fixture where label='no-email')),'no_recipient','recipient validation has explicit outcome');
update public.clients set email='changed@example.invalid' where id='aaaaaaaa-3333-4333-8333-333333333333';
insert into fixture values('dst',to_jsonb(pg_temp.new_message(9)));
select public.update_appointment((select appointment_id from public.messages where id=(select trim('"' from data::text)::uuid from fixture where label='dst')),1,'{"starts_at":"2027-03-28T08:00:00Z","ends_at":"2027-03-28T09:00:00Z"}');
select is((select scheduled_for from public.messages where appointment_id=(select appointment_id from public.messages where id=(select trim('"' from data::text)::uuid from fixture where label='dst')) and status='queued'),'2027-03-27T08:00:00Z'::timestamptz,'spring DST reminder is 24 elapsed hours before event');
select public.update_appointment((select appointment_id from public.messages where id=(select trim('"' from data::text)::uuid from fixture where label='dst')),2,'{"starts_at":"2027-10-31T08:00:00Z","ends_at":"2027-10-31T09:00:00Z"}');
select is((select scheduled_for from public.messages where appointment_id=(select appointment_id from public.messages where id=(select trim('"' from data::text)::uuid from fixture where label='dst')) and status='queued'),'2027-10-30T08:00:00Z'::timestamptz,'autumn DST reminder is 24 elapsed hours before event');
insert into fixture values('lag',to_jsonb(pg_temp.new_message(10)));
update public.messages set scheduled_for=clock_timestamp()-interval '10 minutes' where id=(select trim('"' from data::text)::uuid from fixture where label='lag');
select ok(public.reminder_worker_health(false)->'warnings' @> '[{"kind":"queue_lag","affected":1}]','late due queue raises operational alarm');
select throws_ok($$select public.finish_reminder((select (data->>'id')::uuid from fixture where label='claim'),(select (data->>'claim')::uuid from fixture where label='claim'),'accepted','unsafe provider id')$$,'22023',null,'provider acknowledgement has bounded safe identity');
select public.finish_reminder_run((select trim('"' from data::text)::uuid from fixture where label='run'),true);
select is(public.reminder_worker_health(true)->>'status','degraded','unknown and failed work degrade health');
select ok(exists(select 1 from app_private.reminder_alerts where kind='uncertain' and resolved_at is null),'uncertainty produces persisted operational alarm');
select ok(not exists(select 1 from app_private.reminder_alerts where kind='worker_stale' and resolved_at is null),'successful idle/completed worker is distinguished from stopped worker');
update app_private.reminder_runs set finished_at=clock_timestamp()-interval '10 minutes';
select ok(public.reminder_worker_health(true)->'warnings' @> '[{"kind":"worker_stale","affected":1}]','missing heartbeat is an alarm even without due work');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select is(public.reminder_tenant_health()#>>'{counts,uncertain}','0','health never reveals another tenant uncertainty count');
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select throws_ok($$select public.reminder_tenant_health()$$,'42501',null,'staff cannot inspect owner health');
reset role;
update app_private.reminder_settings set enabled=false;
select is(public.reminder_worker_health(true)->>'mode','disabled','deliberately disabled delivery is explicit');
select is((select count(*)::int from app_private.reminder_alerts where resolved_at is null),0,'disabled mode resolves operational alarms');
set local role anon;
select throws_ok($$select public.reminder_worker_health(false)$$,'42501',null,'anonymous cannot inspect operational counts');
reset role;
select ok((select bool_and(relrowsecurity) from pg_class where oid in('app_private.reminder_settings'::regclass,'app_private.reminder_runs'::regclass,'app_private.reminder_dispatches'::regclass,'app_private.reminder_alerts'::regclass)),'new private tables have RLS');
select * from finish();
rollback;
