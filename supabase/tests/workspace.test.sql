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
select ok((select bool_and(relrowsecurity) from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r'), 'RLS enabled on every public table');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select is((select count(*)::int from public.tenants),1,'owner only sees own tenant');
select is((select count(*)::int from public.users),2,'users scoped to tenant');
select is((select count(*)::int from public.clients),2,'same names do not merge client identities');
select is((select count(*)::int from public.locations),1,'locations isolated');
select is((select count(*)::int from public.services),1,'services isolated');
select throws_ok($$insert into public.clients(tenant_id,first_name,last_name) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Bad','Insert')$$,'42501',null,'cannot insert another tenant client');
select throws_ok($$update public.users set role='owner' where id=auth.uid()$$,'42501',null,'profile privileges cannot be edited directly');
select throws_ok($$insert into public.appointments(tenant_id,client_id,service_id,location_id,operator_id,service_name,price_cents,starts_at,ends_at) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-3333-4333-8333-333333333333','aaaaaaaa-2222-4222-8222-222222222222','aaaaaaaa-1111-4111-8111-111111111111',auth.uid(),'x',1,'2099-01-01 10:00Z','2099-01-01 11:00Z')$$,'42501',null,'appointments cannot bypass transactional RPC');

create temporary table fixture(input jsonb,appointment_id uuid);
insert into fixture(input) values(jsonb_build_object('client_id','aaaaaaaa-3333-4333-8333-333333333333','service_id','aaaaaaaa-2222-4222-8222-222222222222','location_id','aaaaaaaa-1111-4111-8111-111111111111','operator_id','11111111-1111-4111-8111-111111111111','starts_at','2099-01-01T10:00:00Z','ends_at','2099-01-01T11:00:00Z','price_cents',5000));
update fixture set appointment_id=(public.create_appointment('cccccccc-1111-4111-8111-111111111111',input)).id;
select is((select count(*)::int from public.appointments),1,'appointment created');
select is((select (public.create_appointment('cccccccc-1111-4111-8111-111111111111',input)).id from fixture),(select appointment_id from fixture),'idempotency returns same resource');
select is((select count(*)::int from public.appointments),1,'idempotent retry does not duplicate');
select throws_ok($$select public.create_appointment('cccccccc-1111-4111-8111-111111111111',input||'{"price_cents":5001}'::jsonb) from fixture$$,'23505',null,'idempotency key rejects changed payload');
select throws_ok($$select public.create_appointment(gen_random_uuid(),input) from fixture$$,'23P01',null,'overlap rejected by database');
select throws_ok($$select public.create_appointment(gen_random_uuid(),input||'{"client_id":"bbbbbbbb-3333-4333-8333-333333333333"}'::jsonb) from fixture$$,'22023',null,'cross-tenant references rejected by RPC');
select is((select count(*)::int from public.messages where status='queued'),1,'enabled future reminder queued atomically');

select lives_ok($$select public.update_appointment(appointment_id,1,'{"starts_at":"2099-01-01T12:00:00Z","ends_at":"2099-01-01T13:00:00Z"}'::jsonb) from fixture$$,'version checked move succeeds');
select is((select count(*)::int from public.messages where status='cancelled'),1,'move cancels old reminder');
select is((select count(*)::int from public.messages where status='queued'),1,'move creates one current reminder');
select throws_ok($$select public.update_appointment(appointment_id,1,'{"price_cents":8000}'::jsonb) from fixture$$,'40001',null,'stale update rejected');
select throws_ok($$select public.update_appointment(appointment_id,null,'{"price_cents":5000}'::jsonb) from fixture$$,'40001',null,'null appointment version cannot bypass concurrency checks');
select throws_ok($$select public.update_client('aaaaaaaa-4444-4444-8444-444444444444',null,'{"archived":false}')$$,'40001',null,'null client version cannot bypass concurrency checks');
select lives_ok($$select public.update_appointment(appointment_id,2,'{"status":"confirmed"}'::jsonb) from fixture$$,'confirm transition succeeds');
select is((select count(*)::int from public.messages where status='queued'),1,'confirmation does not duplicate reminder');
select throws_ok($$select public.update_appointment(appointment_id,3,'{"status":"completed"}'::jsonb) from fixture$$,'22023',null,'future appointment cannot be completed');
update public.services set price_cents=9900 where id='aaaaaaaa-2222-4222-8222-222222222222';
select is((select price_cents from public.appointments limit 1),5000,'catalog edit preserves historical price');
select throws_ok($$select public.update_client('aaaaaaaa-3333-4333-8333-333333333333',1,'{"archived":true}')$$,'22023',null,'cannot archive client with upcoming appointments');
select lives_ok($$select public.update_appointment(appointment_id,3,'{"status":"cancelled"}'::jsonb) from fixture$$,'cancellation succeeds');
select is((select count(*)::int from public.messages where status='queued'),0,'cancellation removes all queued reminders');
select throws_ok($$select public.update_appointment(appointment_id,4,'{"status":"booked"}'::jsonb) from fixture$$,'22023',null,'terminal appointment cannot be reopened accidentally');
select lives_ok($$select public.update_client('aaaaaaaa-3333-4333-8333-333333333333',1,'{"archived":true}')$$,'archival preserves history');
select is((select count(*)::int from public.appointments),1,'archival retains appointments');

select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select is((select count(*)::int from public.appointments),0,'tenant B cannot read A appointments');
select is((select count(*)::int from public.messages),0,'tenant B cannot read A messages');
select is((select count(*)::int from public.audit_log),3,'tenant B only sees its fixture mutations');
select throws_ok($$select public.update_client('aaaaaaaa-4444-4444-8444-444444444444',1,'{"first_name":"Attack","last_name":"B","email":"","phone":""}')$$,'P0002',null,'tenant B cannot edit A client');

select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select throws_ok($$insert into public.locations(tenant_id,name) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Unauthorized')$$,'42501',null,'operator cannot create locations');
select throws_ok($$select public.update_client('aaaaaaaa-4444-4444-8444-444444444444',1,'{"archived":true}')$$,'42501',null,'operator cannot archive clients');
select throws_ok($$select public.create_appointment(gen_random_uuid(),jsonb_build_object('operator_id','11111111-1111-4111-8111-111111111111'))$$,'42501',null,'operator cannot assign another operator');
select is((select count(*)::int from public.audit_log),0,'operator cannot read owner audit log');

select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}',true);
select lives_ok($$select public.bootstrap_workspace('Nuovo studio','Nuovo owner','Sede','Servizio',60,5000)$$,'onboarding creates workspace');
select lives_ok($$select public.bootstrap_workspace('Retry studio','Retry owner','Retry sede','Retry servizio',60,5000)$$,'onboarding retry is idempotent');
select is((select count(*)::int from public.tenants),1,'onboarding retry still sees one tenant');
select is((select count(*)::int from public.locations),1,'onboarding retry does not duplicate location');
select is((select count(*)::int from public.services),1,'onboarding retry does not duplicate service');

reset role;
-- Historic completed sessions count by studio timezone and frozen price.
-- Deliberately include corrupt future completion data: reporting must still exclude it.
insert into public.appointments(tenant_id,client_id,service_id,location_id,operator_id,service_name,price_cents,starts_at,ends_at,status) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-4444-4444-8444-444444444444','aaaaaaaa-2222-4222-8222-222222222222','aaaaaaaa-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','Snapshot',5000,'2020-12-31 23:30Z','2021-01-01 00:30Z','completed'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-4444-4444-8444-444444444444','aaaaaaaa-2222-4222-8222-222222222222','aaaaaaaa-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','Snapshot',7000,'2021-01-02 10:00Z','2021-01-02 11:00Z','no_show'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-4444-4444-8444-444444444444','aaaaaaaa-2222-4222-8222-222222222222','aaaaaaaa-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','Snapshot',9000,'2199-01-01 10:00Z','2199-01-01 11:00Z','completed');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select is(jsonb_array_length(public.completed_report(2021)->'months'),12,'report returns all twelve months');
select is((public.completed_report(2021)#>>'{months,0,count}')::int,1,'report uses studio year and excludes no-show');
select is((public.completed_report(2021)#>>'{months,0,value_cents}')::int,5000,'report uses frozen appointment price');
select ok((public.completed_report(2021)->'years') @> '[2021]'::jsonb,'report includes historic years dynamically');
select ok(not ((public.completed_report(2021)->'years') @> '[2199]'::jsonb),'future completed sessions do not populate year choices');
select is((public.completed_report(2199)#>>'{months,0,count}')::int,0,'future completions never enter totals');
select throws_ok($$select public.completed_report(9999)$$,'22023',null,'report rejects invalid year');
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select is((public.completed_report(2021)#>>'{months,0,count}')::int,0,'report isolates tenants');
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select throws_ok($$select public.completed_report(2021)$$,'42501',null,'operator cannot read owner report');
reset role;
update public.users set active=false where id='33333333-3333-4333-8333-333333333333';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select is((select count(*)::int from public.clients),0,'deactivated user loses data access');

set local role anon;
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select * from public.clients$$,'42501',null,'anonymous cannot read clients');
select throws_ok($$select public.bootstrap_workspace('Bad','Bad','Bad','Bad',60,0)$$,'42501',null,'anonymous cannot bootstrap workspace');
select * from finish();
rollback;
