begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
 ('19111111-1111-4111-8111-111111111111','privacy-owner@example.invalid',now(),'{}','{}'),
 ('19222222-2222-4222-8222-222222222222','privacy-foreign@example.invalid',now(),'{}','{}'),
 ('19333333-3333-4333-8333-333333333333','privacy-operator@example.invalid',now(),'{}','{}');
insert into public.tenants(id,name) values('19aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Privacy A'),('19bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Privacy B');
insert into public.users(id,tenant_id,display_name,role,clinical_access) values
 ('19111111-1111-4111-8111-111111111111','19aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Owner','owner',true),
 ('19222222-2222-4222-8222-222222222222','19bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Foreign','owner',true),
 ('19333333-3333-4333-8333-333333333333','19aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Operator','operator',true);
insert into public.clients(id,tenant_id,first_name,last_name) values
 ('19aaaaaa-1111-4111-8111-111111111111','19aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','=1+1','Synthetic'),
 ('19aaaaaa-2222-4222-8222-222222222222','19aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Second','Synthetic'),
 ('19bbbbbb-1111-4111-8111-111111111111','19bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Foreign','Synthetic');
create temporary table privacy_results(label text primary key,data jsonb);
grant all on privacy_results to authenticated,service_role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"19111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select lives_ok($$select public.save_privacy_settings(0,'{"contacts":{"months":null,"basis":""},"clinical":{"months":null,"basis":""},"audit":{"months":null,"basis":""}}','','',false)$$,'unfinished policy can be saved');
select is((select version from public.privacy_settings),1,'policy version starts at one');
select is(public.read_privacy_notice('19aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),null::jsonb,'draft notice is not public');
select throws_ok($$select public.save_privacy_settings(0,'{"contacts":{"months":null,"basis":""},"clinical":{"months":null,"basis":""},"audit":{"months":null,"basis":""}}','','',false)$$,'40001',null,'policy version prevents stale overwrite');
select throws_ok($$select public.save_privacy_settings(1,'{"contacts":{"months":null,"basis":""},"clinical":{"months":null,"basis":""},"audit":{"months":null,"basis":""}}','','',true)$$,'22023',null,'review cannot be claimed with missing terms');
select throws_ok($$select public.save_privacy_settings(1,'{"contacts":{"months":-1,"basis":""},"clinical":{"months":null,"basis":""},"audit":{"months":null,"basis":""}}','','',false)$$,'22023',null,'negative months rejected directly in SQL');
select throws_ok($$select public.save_privacy_settings(1,'{"contacts":{"months":1.5,"basis":""},"clinical":{"months":null,"basis":""},"audit":{"months":null,"basis":""}}','','',false)$$,'22023',null,'fractional months rejected');
select throws_ok($$update public.privacy_settings set reviewed=true$$,'42501',null,'policy cannot bypass RPC');
select lives_ok($$select public.create_privacy_request('19000000-1111-4111-8111-111111111111','19aaaaaa-1111-4111-8111-111111111111')$$,'request registered');
select lives_ok($$select public.create_privacy_request('19000000-1111-4111-8111-111111111111','19aaaaaa-1111-4111-8111-111111111111')$$,'registration retry idempotent');
select is((select count(*)::int from public.privacy_requests),1,'one request after retry');
select throws_ok($$select public.create_privacy_request('19000000-1111-4111-8111-111111111111','19aaaaaa-2222-4222-8222-222222222222')$$,'23505',null,'request ID binds client');
select throws_ok($$select public.create_privacy_request(gen_random_uuid(),'19bbbbbb-1111-4111-8111-111111111111')$$,'P0002',null,'cannot register foreign client');
select throws_ok($$select public.update_privacy_request('19000000-1111-4111-8111-111111111111',1,'retained',false)$$,'22023',null,'retention disposition requires identity check');
select lives_ok($$select public.update_privacy_request('19000000-1111-4111-8111-111111111111',1,'reviewing',true)$$,'verified review recorded');
select throws_ok($$select public.update_privacy_request('19000000-1111-4111-8111-111111111111',1,'withdrawn',true)$$,'40001',null,'request stale write rejected');
select throws_ok($$select public.update_privacy_request('19000000-1111-4111-8111-111111111111',2,'reviewing',false)$$,'22023',null,'identity evidence cannot be silently reversed');
select throws_ok($$select public.update_privacy_request('19000000-1111-4111-8111-111111111111',2,'deleted',true)$$,'22023',null,'no false deletion status');
select throws_ok($$select public.update_privacy_request('19000000-1111-4111-8111-111111111111',2,'retained',true)$$,'22023',null,'retention requires a specific reason');
select lives_ok($$select public.update_privacy_request('19000000-1111-4111-8111-111111111111',2,'retained',true,'Riferimento sintetico da verificare col consulente')$$,'explicit retention outcome');
select is((select archived_at from public.clients where id='19aaaaaa-1111-4111-8111-111111111111'),null::timestamptz,'privacy request is not archival');
select is((select count(*)::int from public.clients),2,'privacy request never deletes records');
insert into privacy_results values('export',public.prepare_privacy_export('19000000-2222-4222-8222-222222222222','19aaaaaa-1111-4111-8111-111111111111'));
select is((select data->'snapshot'->'client'->>'id' from privacy_results where label='export'),'19aaaaaa-1111-4111-8111-111111111111','snapshot binds selected client');
select ok((select data->'snapshot'->>'client' not like '%Foreign%' from privacy_results where label='export'),'no foreign personal data');
select throws_ok($$select public.prepare_privacy_export('19000000-2222-4222-8222-222222222222','19aaaaaa-1111-4111-8111-111111111111')$$,'40001',null,'live generation lease cannot be claimed twice');
select throws_ok($$select payload from app_private.privacy_export_payloads$$,'42501',null,'snapshots cannot be selected directly');
select throws_ok($$select public.finish_privacy_export('19000000-2222-4222-8222-222222222222',gen_random_uuid(),repeat('a',64),100)$$,'42501',null,'owner cannot forge completion');
select throws_ok($$select public.claim_privacy_export_cleanup()$$,'42501',null,'owner cannot acquire privileged deletion paths');
select is((select count(*)::int from storage.objects where bucket_id='glow-exports'),0,'no ordinary Storage access');
select set_config('request.jwt.claims','{"sub":"19222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select is((select count(*)::int from public.privacy_exports),0,'foreign tenant cannot list exports');
select is((select count(*)::int from public.privacy_requests),0,'foreign tenant cannot list requests');
select is((select count(*)::int from public.privacy_settings),0,'foreign tenant cannot list policies');
select throws_ok($$select public.access_privacy_export('19000000-2222-4222-8222-222222222222','read')$$,'P0002',null,'foreign download denied');
select set_config('request.jwt.claims','{"sub":"19333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select is((select count(*)::int from public.privacy_exports),0,'clinical operator cannot enumerate export jobs');
select throws_ok($$select public.prepare_privacy_export(gen_random_uuid(),'19aaaaaa-1111-4111-8111-111111111111')$$,'42501',null,'clinical access alone cannot export');
select throws_ok($$select public.create_privacy_request(gen_random_uuid(),'19aaaaaa-1111-4111-8111-111111111111')$$,'42501',null,'operator cannot register privacy request');
reset role;
update public.users set clinical_access=false where id='19111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"19111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select throws_ok($$select public.prepare_privacy_export(gen_random_uuid(),'19aaaaaa-1111-4111-8111-111111111111')$$,'42501',null,'owner needs explicit clinical grant for export');
reset role;
update public.users set clinical_access=true where id='19111111-1111-4111-8111-111111111111';
set local role service_role;
select is(public.finish_privacy_export('19000000-2222-4222-8222-222222222222',gen_random_uuid(),null,null,'unavailable'),false,'stale claim cannot finish');
select is(public.finish_privacy_export('19000000-2222-4222-8222-222222222222',(select (data->>'claim')::uuid from privacy_results where label='export'),null,null,'unavailable'),true,'failed attempt releases lease');
set local role authenticated;
insert into privacy_results values('retry',public.prepare_privacy_export('19000000-2222-4222-8222-222222222222','19aaaaaa-1111-4111-8111-111111111111'));
select is((select data->'snapshot' from privacy_results where label='retry'),(select data->'snapshot' from privacy_results where label='export'),'retry keeps exact snapshot');
select lives_ok($$select public.access_privacy_export('19000000-2222-4222-8222-222222222222','revoke')$$,'revocation during generation is supported');
select throws_ok($$select public.access_privacy_export('19000000-2222-4222-8222-222222222222','read')$$,'22023','EXPORT_EXPIRED','revocation blocks read immediately');
set local role service_role;
select is(public.finish_privacy_export('19000000-2222-4222-8222-222222222222',(select (data->>'claim')::uuid from privacy_results where label='retry'),repeat('a',64),100),false,'in-flight worker cannot finalize revoked job');
insert into privacy_results values('cleanup',public.claim_privacy_export_cleanup());
select is(jsonb_array_length((select data from privacy_results where label='cleanup')),1,'revoked copy eligible for cleanup');
select is(jsonb_array_length(public.claim_privacy_export_cleanup()),0,'cleanup lease prevents double claim');
select is(public.complete_privacy_export_cleanup('19000000-2222-4222-8222-222222222222',gen_random_uuid()),false,'cleanup acknowledgment checks claim');
select is(public.complete_privacy_export_cleanup('19000000-2222-4222-8222-222222222222',(select (data->0->>'claim')::uuid from privacy_results where label='cleanup')),true,'cleanup acknowledged only after object absent');
reset role;
select is((select payload from app_private.privacy_export_payloads where export_id='19000000-2222-4222-8222-222222222222'),null::jsonb,'expired snapshot cleared');
select is((select count(*)::int from app_private.privacy_policy_versions where tenant_id='19aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),1,'policy versions retained');
select ok(exists(select 1 from public.audit_log where action='privacy.export_snapshot'),'sensitive snapshots audited without payload');
select ok((select not public from storage.buckets where id='glow-exports'),'export bucket private');
select is((public.maintenance_worker_health(false)->'counts'->>'export_cleanup_lag')::integer,0,'healthy export cleanup adds only a bounded count');
select ok((select bool_and(relrowsecurity) from pg_class where oid in('public.privacy_requests'::regclass,'public.privacy_exports'::regclass,'public.privacy_settings'::regclass,'app_private.privacy_export_payloads'::regclass)),'privacy tables have RLS');
insert into public.privacy_exports(id,tenant_id,client_id,requested_by,state,created_at)
 select gen_random_uuid(),'19aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','19aaaaaa-1111-4111-8111-111111111111','19111111-1111-4111-8111-111111111111','failed',clock_timestamp()-interval '2 minutes' from generate_series(1,3);
set local role authenticated;
select throws_ok($$select public.prepare_privacy_export(gen_random_uuid(),'19aaaaaa-1111-4111-8111-111111111111')$$,'54000',null,'failed copies count toward snapshot space quota too');
select * from finish();
rollback;
