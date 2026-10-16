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
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select is(public.reminder_preferences()->>'from','Glow <reminder@glowlabs.it>','chosen sender is fixed');
select is(public.reminder_preferences()->>'reply_to','owner-a@example.invalid','reply-to is confirmed owner mailbox');
select is(public.reminder_preferences(false)->>'enabled','false','owner can switch off own reminders');
select is((select reminders_enabled from public.tenants where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),false,'settings cannot alter another tenant');
select public.reminder_preferences(true);
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select throws_ok($$select public.reminder_preferences(true)$$,'42501',null,'operator cannot change email preferences');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
update app_private.reminder_settings set enabled=true,provider='resend-v1';
insert into fixture values('run',to_jsonb(gen_random_uuid()));
select public.start_reminder_run((select trim('"' from data::text)::uuid from fixture where label='run'),'resend-v1');
create function pg_temp.claim() returns jsonb language sql as $$select public.claim_reminder((select trim('"' from data::text)::uuid from fixture where label='run'));$$;
create function pg_temp.new_message(n integer) returns uuid language plpgsql as $$
declare a public.appointments; m uuid;
begin
 a:=public.create_appointment(gen_random_uuid(),jsonb_build_object('client_id','aaaaaaaa-3333-4333-8333-333333333333','service_id','aaaaaaaa-2222-4222-8222-222222222222','location_id','aaaaaaaa-1111-4111-8111-111111111111','operator_id','11111111-1111-4111-8111-111111111111','starts_at',clock_timestamp()+interval '3 days'+n*interval '3 hours','ends_at',clock_timestamp()+interval '3 days 1 hour'+n*interval '3 hours','price_cents',5000));
 update public.messages set scheduled_for=clock_timestamp()-interval '1 minute' where appointment_id=a.id returning id into m;
 return m;
end;
$$;

create function pg_temp.dispatch(n integer) returns uuid language plpgsql as $$
declare id uuid; j jsonb;
begin id:=pg_temp.new_message(n);j:=pg_temp.claim();
 if (j->>'id')::uuid<>id then raise exception 'Unexpected fixture claim';end if;
 insert into fixture values('job-'||n,j);
 perform public.begin_reminder_dispatch(id,(j->>'claim')::uuid);return id;end;
$$;
create function pg_temp.event(n integer,event text,provider uuid default 'eeeeeeee-1111-4111-8111-111111111111',suffix text default '') returns boolean language sql as $$
 select public.record_resend_event('msg_'||n||replace(event,'.','_')||suffix,(data->>'id')::uuid,provider,event,clock_timestamp(),'Glow <reminder@glowlabs.it>','test-a@example.invalid',event in('email.bounced','email.complained','email.suppressed')) from fixture where label='job-'||n;
$$;
create function pg_temp.ack(n integer,result text,provider text default null) returns void language sql as $$
 select public.finish_reminder((data->>'id')::uuid,(data->>'claim')::uuid,result,provider) from fixture where label='job-'||n;
$$;
select pg_temp.dispatch(1);
select is((select envelope->>'version' from app_private.reminder_dispatches),'glow-reminder-v2','live dispatch freezes complete v2 identity');
select is((select envelope->>'from' from app_private.reminder_dispatches),'Glow <reminder@glowlabs.it>','From is part of frozen snapshot');
select is((select envelope->>'reply_to' from app_private.reminder_dispatches),'owner-a@example.invalid','verified Reply-To is part of frozen snapshot');
select is(public.lookup_reminder_acceptance((select (data->>'id')::uuid from fixture where label='job-1'))->>'kind','unknown','missing webhook evidence is not proof of absence');
select is(pg_temp.event(1,'email.delivered'),true,'signed correlated delivery is persisted before HTTP send acknowledgement');
select is((select status from public.messages where id=(select (data->>'id')::uuid from fixture where label='job-1')),'processing','early event preserves active fencing lease');
select is(public.lookup_reminder_acceptance((select (data->>'id')::uuid from fixture where label='job-1'))->>'kind','accepted','signed event proves acceptance after lost HTTP response');
select pg_temp.ack(1,'unknown');
select is((select status from public.messages where id=(select (data->>'id')::uuid from fixture where label='job-1')),'delivered','webhook evidence wins over ambiguous HTTP result');
select lives_ok($$select pg_temp.ack(1,'unknown')$$,'same ack retries remain idempotent when event overrode ambiguity');
select is(pg_temp.event(1,'email.delivered'),true,'duplicate event acknowledged');
select is((select count(*)::int from app_private.resend_events),1,'duplicate does not append event or audit twice');
select pg_temp.event(1,'email.sent');
select is((select status from public.messages where id=(select (data->>'id')::uuid from fixture where label='job-1')),'delivered','late sent event cannot regress delivered');
select is(public.record_resend_event('msg_wrong_to',(select (data->>'id')::uuid from fixture where label='job-1'),'eeeeeeee-1111-4111-8111-111111111111','email.bounced',clock_timestamp(),'Glow <reminder@glowlabs.it>','other@example.invalid',true),false,'wrong recipient cannot affect message or suppression');
select is(pg_temp.event(1,'email.bounced','eeeeeeee-2222-4222-8222-222222222222'),false,'conflicting provider ID cannot overwrite correlation');
select pg_temp.dispatch(2);
select pg_temp.ack(2,'unknown');
select pg_temp.event(2,'email.sent','eeeeeeee-2222-4222-8222-222222222222');
select is((select status from public.messages where id=(select (data->>'id')::uuid from fixture where label='job-2')),'accepted','late sent event resolves uncertainty without a second POST');
select pg_temp.event(2,'email.bounced','eeeeeeee-2222-4222-8222-222222222222');
select is((select status from public.messages where id=(select (data->>'id')::uuid from fixture where label='job-2')),'bounced','definitive bounce visible on message');
select pg_temp.event(2,'email.delivered','eeeeeeee-2222-4222-8222-222222222222');
select is((select status from public.messages where id=(select (data->>'id')::uuid from fixture where label='job-2')),'bounced','late delivery cannot erase permanent failure');
select is((select count(*)::int from app_private.reminder_suppressions),1,'hard bounce suppresses normalized recipient within tenant');
select pg_temp.new_message(3);
select is(pg_temp.claim(),null,'suppressed recipient cannot receive another reminder');
select is((select failure_code from public.messages where appointment_id=(select id from public.appointments order by starts_at desc limit 1)),'recipient_suppressed','suppression has explicit failure code');
select ok(public.reminder_worker_health(false)->'warnings' @> '[{"kind":"failed","affected":1}]','bounce raises existing operational failure alarm');
update public.clients set email='new-recipient@example.invalid' where id='aaaaaaaa-3333-4333-8333-333333333333';
select pg_temp.dispatch(4);
select pg_temp.ack(4,'retryable');
update public.messages set next_attempt_at=clock_timestamp()-interval '1 second' where id=(select (data->>'id')::uuid from fixture where label='job-4');
update auth.users set email='changed-owner@example.invalid' where id='11111111-1111-4111-8111-111111111111';
update fixture set data=pg_temp.claim() where label='job-4';
select is(public.begin_reminder_dispatch((select (data->>'id')::uuid from fixture where label='job-4'),(select (data->>'claim')::uuid from fixture where label='job-4'))->>'reply_to','owner-a@example.invalid','retry preserves original Reply-To after owner edit');
select pg_temp.ack(4,'rejected');
update auth.users set email_confirmed_at=null where id='11111111-1111-4111-8111-111111111111';
select pg_temp.new_message(5);
select is(pg_temp.claim(),null,'unverified Reply-To prevents new live dispatch');
select throws_ok($$select public.reminder_preferences(true)$$,'22023',null,'cannot enable tenant with unverified Reply-To');
set local role authenticated;
select throws_ok($$select public.record_resend_event('msg_fake',gen_random_uuid(),gen_random_uuid(),'email.delivered',now(),'from','to',false)$$,'42501',null,'owner cannot forge delivery evidence');
select throws_ok($$select public.lookup_reminder_acceptance(gen_random_uuid())$$,'42501',null,'owner cannot read global provider evidence');
select throws_ok($$select * from app_private.reminder_suppressions$$,'42501',null,'suppression store has no ordinary grants');
reset role;
select ok((select bool_and(relrowsecurity) from pg_class where oid in('app_private.resend_events'::regclass,'app_private.reminder_suppressions'::regclass)),'new private stores have RLS');
select * from finish();
rollback;
