begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
 ('11111111-1111-4111-8111-111111111111','owner-a@example.invalid',now(),'{}','{}'),
 ('22222222-2222-4222-8222-222222222222','owner-b@example.invalid',now(),'{}','{}'),
 ('33333333-3333-4333-8333-333333333333','operator@example.invalid',now(),'{}','{}');
insert into public.tenants(id,name,reminders_enabled) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Studio A',true),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Studio B',false);
insert into public.users(id,tenant_id,display_name,role) values
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Owner A','owner'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Owner B','owner'),
 ('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Operator A','operator');
insert into public.locations(id,tenant_id,name) values('aaaaaaaa-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Sede A');
insert into public.services(id,tenant_id,name,duration_minutes,price_cents) values('aaaaaaaa-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Servizio riservato',60,5000);
insert into public.clients(id,tenant_id,first_name,last_name,email) values('aaaaaaaa-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Nome riservato','Cognome riservato','client@example.invalid');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
create temporary table fixture(label text primary key,data jsonb);
create function pg_temp.appt(label text,n integer) returns uuid language plpgsql as $$
declare a public.appointments;
begin
 a:=public.create_appointment(gen_random_uuid(),jsonb_build_object('client_id','aaaaaaaa-3333-4333-8333-333333333333','service_id','aaaaaaaa-2222-4222-8222-222222222222','location_id','aaaaaaaa-1111-4111-8111-111111111111','operator_id','11111111-1111-4111-8111-111111111111','starts_at',now()+interval '3 days'+n*interval '3 hours','ends_at',now()+interval '3 days 1 hour'+n*interval '3 hours','price_cents',5000));
 insert into fixture values(label,to_jsonb(a));return a.id;
end;$$;
create function pg_temp.issue(label text,n integer) returns void language plpgsql as $$
declare aid uuid;
begin aid:=pg_temp.appt(label||'-appt',n);insert into fixture values(label,public.manage_appointment_action_links(aid,'issue',1,gen_random_uuid()));end;$$;
create function pg_temp.use_link(label text,action text,key uuid default null) returns jsonb language sql as $$
 select public.use_appointment_action_link(encode(digest((select data->>'token' from fixture where fixture.label=$1),'sha256'),'hex'),$2,$3);
$$;
select ok(not has_function_privilege('anon','public.use_appointment_action_link(text,text,uuid)','execute'),'anonymous cannot call capability SQL directly');
select ok(not has_function_privilege('authenticated','public.use_appointment_action_link(text,text,uuid)','execute'),'professional cookies cannot access the service gateway');
select ok(not has_table_privilege('service_role','app_private.appointment_action_links','select'),'service clients cannot list raw capability hashes');
select ok(not has_function_privilege('service_role','app_private.issue_appointment_action_link(public.appointments,uuid,uuid,uuid)','execute'),'internal issuer cannot be called directly');
select is(public.appointment_response_preferences()->>'notice_hours','0','default allows cancellation until appointment start');
do $$begin perform pg_temp.issue('main',0);end;$$;
select is((select length(data->>'token') from fixture where label='main'),64,'manual capability has 256 bits of random entropy');
select ok((pg_temp.use_link('main','read')->'context')::text not like '%riservato%','public view omits patient names and treatment');
select is((select status from public.appointments where id=(select (data->>'id')::uuid from fixture where label='main-appt')),'booked','read does not confirm appointment');
select is((select count(*)::int from app_private.appointment_responses),0,'read does not consume an action');
select ok(not(public.manage_appointment_action_links((select (data->>'id')::uuid from fixture where label='main-appt'))::text like '%token%'),'professional metadata contains neither token nor hash');
insert into fixture values('confirm',pg_temp.use_link('main','confirm','88888888-8888-4888-8888-888888888888'));
select is((select status from public.appointments where id=(select (data->>'id')::uuid from fixture where label='main-appt')),'confirmed','explicit POST capability action confirms');
select is((select version from public.appointments where id=(select (data->>'id')::uuid from fixture where label='main-appt')),2,'confirmation participates in optimistic concurrency');
select is(pg_temp.use_link('main','confirm','88888888-8888-4888-8888-888888888888'),(select data from fixture where label='confirm'),'lost confirmation response retries identically');
select is(pg_temp.use_link('main','confirm',gen_random_uuid()),(select data from fixture where label='confirm'),'different retry key cannot duplicate the same action');
select is(pg_temp.use_link('main','cancel','88888888-8888-4888-8888-888888888888')->>'status','409','same request key cannot change action');
select is(pg_temp.use_link('main','read')->'context'->>'status','confirmed','confirmation leaves the link available for a later cancellation');
select is((select count(*)::int from public.messages),1,'confirmation creates no duplicate reminder');
insert into fixture values('cancel',pg_temp.use_link('main','cancel','99999999-9999-4999-8999-999999999999'));
select is((select status from public.appointments where id=(select (data->>'id')::uuid from fixture where label='main-appt')),'cancelled','client cancellation updates agenda');
select is((select schedule_revision from public.appointments where id=(select (data->>'id')::uuid from fixture where label='main-appt')),2,'cancel invalidates the schedule revision');
select is((select status from public.messages limit 1),'cancelled','queued reminder cancelled in same transaction');
select is(pg_temp.use_link('main','cancel','99999999-9999-4999-8999-999999999999'),(select data from fixture where label='cancel'),'cancel retry survives its own revision increment');
select is(pg_temp.use_link('main','confirm',gen_random_uuid())->>'status','410','cancelled appointment cannot regress to confirmed');
select is(pg_temp.use_link('main','read')->'receipt'->>'action','cancel','reopening shows cancellation receipt');
select is((select count(*)::int from app_private.appointment_responses),2,'one durable event for each action');
select lives_ok($$select pg_temp.appt('replacement',0)$$,'cancellation frees the calendar slot');

do $$begin perform pg_temp.issue('moved',1);end;$$;
select public.update_appointment((select (data->>'id')::uuid from fixture where label='moved-appt'),1,jsonb_build_object('starts_at',now()+interval '8 days','ends_at',now()+interval '8 days 1 hour'));
select is(pg_temp.use_link('moved','confirm',gen_random_uuid())->>'status','410','old link cannot confirm a rescheduled appointment');
select is(pg_temp.use_link('moved','cancel',gen_random_uuid())->>'status','410','old link cannot cancel the new schedule');
do $$begin perform pg_temp.issue('revoked',2);perform public.manage_appointment_action_links((select (data->>'id')::uuid from fixture where label='revoked-appt'),'revoke',null,null,(select (data->>'id')::uuid from fixture where label='revoked'));end;$$;
select is(pg_temp.use_link('revoked','read')->>'status','410','revocation prevents even a public read');
do $$begin perform pg_temp.issue('expired',3);update app_private.appointment_action_links set expires_at=clock_timestamp()-interval '1 second' where id=(select (data->>'id')::uuid from fixture where label='expired');end;$$;
select is(pg_temp.use_link('expired','cancel',gen_random_uuid())->>'status','410','expiry enforced by server time');
do $$begin perform pg_temp.issue('cutoff',4);perform public.appointment_response_preferences(168);end;$$;
select is(pg_temp.use_link('cutoff','read')->'context'->>'can_cancel','false','policy changes also affect existing links');
select is(pg_temp.use_link('cutoff','cancel',gen_random_uuid())->>'status','422','server rejects cancellation after cutoff');
select is(pg_temp.use_link('cutoff','confirm',gen_random_uuid())->>'ok','true','cutoff blocks cancellation only');
select throws_ok($$select public.appointment_response_preferences(169)$$,'22023','INVALID_NOTICE','policy validates allowed range');
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select throws_ok($$select public.manage_appointment_action_links((select (data->>'id')::uuid from fixture where label='cutoff-appt'))$$,'P0002','NOT_FOUND','another tenant cannot inspect links or events');
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select throws_ok($$select public.manage_appointment_action_links((select (data->>'id')::uuid from fixture where label='cutoff-appt'))$$,'42501','FORBIDDEN','unassigned operator cannot manage appointment link');
select throws_ok($$select public.appointment_response_preferences(0)$$,'42501','FORBIDDEN','operator cannot change studio policy');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$declare a uuid;key uuid:=gen_random_uuid();r jsonb;begin
 a:=pg_temp.appt('idempotent-appt',5);r:=public.manage_appointment_action_links(a,'issue',1,key);insert into fixture values('idempotent',r),('idempotent-key',to_jsonb(key));
end;$$;
select is(public.manage_appointment_action_links((select (data->>'id')::uuid from fixture where label='idempotent-appt'),'issue',1,(select (data#>>'{}')::uuid from fixture where label='idempotent-key'))->'token','null'::jsonb,'issue retry never recovers a stored plaintext token');
select throws_ok($$select public.manage_appointment_action_links((select (data->>'id')::uuid from fixture where label='idempotent-appt'),'issue',2,(select (data#>>'{}')::uuid from fixture where label='idempotent-key'))$$,'23505','IDEMPOTENCY_MISMATCH','issue key cannot be reused with a different version');
do $$begin perform public.manage_appointment_action_links((select (data->>'id')::uuid from fixture where label='idempotent-appt'),'issue',1,gen_random_uuid());end;$$;
select is(pg_temp.use_link('idempotent','read')->>'status','410','issuing a replacement revokes old manual link');

-- Real Resend transport is never used: test only the transactional snapshot.
update app_private.reminder_settings set enabled=true,provider='resend-v1';
do $$declare a uuid;j jsonb;env jsonb;run uuid:=gen_random_uuid();begin
 a:=pg_temp.appt('email-appt',6);
 update public.messages set status='cancelled' where appointment_id<>a and status='queued';
 update public.messages set scheduled_for=now()-interval '1 minute' where appointment_id=a;
 perform public.start_reminder_run(run,'resend-v1');j:=public.claim_reminder(run);
 env:=public.begin_reminder_dispatch((j->>'id')::uuid,(j->>'claim')::uuid);
 insert into fixture values('email',env),('email-job',j);
end;$$;
select ok((select data->>'text' like '%https://glowlabs.it/appuntamento#%' from fixture where label='email'),'new reminder includes a personal fragment link');
select is((select count(*)::int from app_private.appointment_action_links where message_id is not null),1,'exactly one capability per frozen email');
select ok((select data->>'text' not like '%riservato%' from fixture where label='email'),'new email still omits patient and treatment names');
do $$declare j jsonb:=(select data from fixture where label='email-job');begin
 perform public.finish_reminder((j->>'id')::uuid,(j->>'claim')::uuid,'retryable');
 update public.messages set next_attempt_at=clock_timestamp()-interval '1 second' where id=(j->>'id')::uuid;
 j:=public.claim_reminder((select id from app_private.reminder_runs order by started_at desc limit 1));
 insert into fixture values('email-retry',public.begin_reminder_dispatch((j->>'id')::uuid,(j->>'claim')::uuid));
end;$$;
select is((select data from fixture where label='email-retry'),(select data from fixture where label='email'),'provider retry preserves frozen text and token exactly');
select is((select count(*)::int from app_private.appointment_action_links where message_id is not null),1,'retry never generates another email link');
select * from finish();
rollback;
