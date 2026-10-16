begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
('f1111111-1111-4111-8111-111111111111','clinical-owner@example.invalid',now(),'{}','{}'),
('f2222222-2222-4222-8222-222222222222','clinical-other@example.invalid',now(),'{}','{}'),
('f3333333-3333-4333-8333-333333333333','clinical-staff@example.invalid',now(),'{}','{}');
insert into public.tenants(id,name) values('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Clinical A'),('fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Clinical B');
insert into public.users(id,tenant_id,display_name,role,clinical_access) values
('f1111111-1111-4111-8111-111111111111','faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Owner','owner',true),
('f2222222-2222-4222-8222-222222222222','fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Other','owner',true),
('f3333333-3333-4333-8333-333333333333','faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Staff','operator',true);
insert into public.clients(id,tenant_id,first_name,last_name) values('faaaaaaa-1111-4111-8111-111111111111','faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Synthetic','Client');
insert into public.locations(id,tenant_id,name) values('faaaaaaa-2222-4222-8222-222222222222','faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Location');
insert into public.services(id,tenant_id,name,duration_minutes) values('faaaaaaa-3333-4333-8333-333333333333','faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Service',60);
insert into public.appointments(id,tenant_id,client_id,service_id,location_id,operator_id,service_name,price_cents,starts_at,ends_at)
values('faaaaaaa-4444-4444-8444-444444444444','faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','faaaaaaa-1111-4111-8111-111111111111','faaaaaaa-3333-4333-8333-333333333333','faaaaaaa-2222-4222-8222-222222222222','f1111111-1111-4111-8111-111111111111','Service',5000,now()+interval '2 days',now()+interval '2 days 1 hour');
create temporary table results(label text primary key,id uuid);
grant all on results to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
insert into results values('consent',(public.publish_clinical_template('f0000000-1111-4111-8111-111111111111',null,0,'consent','Consenso di prova','Testo sintetico non destinato a uso reale.','[]',null)).id);
insert into results values('anamnesis',(public.publish_clinical_template('f0000000-2222-4222-8222-222222222222',null,0,'anamnesis','Anamnesi di prova','Questionario sintetico non clinico.','[{"id":"f9999999-1111-4111-8111-111111111111","label":"Domanda sintetica","type":"yes_no","required":true}]',null)).id);
insert into results values('pigment',(public.save_pigment('f0000000-3333-4333-8333-333333333333',null,0,'Brand A','Pigment A','CODE',true)).id);
reset role;
-- Trusted fixture: policy tests do not pretend this is a real Storage upload.
insert into public.stored_files(id,tenant_id,pigment_id,kind,created_by,request_id,state,upload_path,object_path,expected_size,expected_sha256,mime_type,size_bytes,sha256,width,height,ready_at)
values('faaaaaaa-5555-4555-8555-555555555555','faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',(select id from results where label='pigment'),'pigment_label','f1111111-1111-4111-8111-111111111111',gen_random_uuid(),'ready','faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/faaaaaaa-5555-4555-8555-555555555555/upload','faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/faaaaaaa-5555-4555-8555-555555555555/image',100,repeat('a',64),'image/jpeg',100,repeat('b',64),10,10,now());
set local role authenticated;
insert into results values('lot',(public.save_pigment_lot('f0000000-4444-4444-8444-444444444444',null,0,(select id from results where label='pigment'),'LOT-1',current_date+365,'faaaaaaa-5555-4555-8555-555555555555','Synthetic label',true)).id);
insert into results values('preparation',(public.save_treatment_preparation('f0000000-5555-4555-8555-555555555555','faaaaaaa-4444-4444-8444-444444444444',1,0,(select id from results where label='consent'),(select id from results where label='anamnesis'),'{"f9999999-1111-4111-8111-111111111111":true}',array[(select id from results where label='lot')])).id);
create temporary table capabilities(label text primary key,data jsonb);
reset role;
grant all on capabilities,results to authenticated,service_role;
set local role authenticated;
insert into capabilities values('first',public.create_signature_request('f0000000-8888-4888-8888-888888888888','faaaaaaa-4444-4444-8444-444444444444',1,1,'link'));

-- The fixtures above are synthetic and rolled back. Never use on production.
select is((select count(*)::int from public.photo_permissions),0,'treatment preparation grants no photo permission');
select throws_ok($$select public.prepare_photo('faaaaaaa-1111-4111-8111-111111111111','faaaaaaa-4444-4444-8444-444444444444','before',gen_random_uuid(),100,repeat('a',64),'image/jpeg')$$,'22023','PHOTO_PERMISSION_REQUIRED','collection requires explicit signed permission');
select throws_ok($$insert into public.photo_permissions(tenant_id,client_id,appointment_id,consent_id,purpose,allowed,signed_at) values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'documentation',true,now())$$,'42501',null,'even owner cannot forge a grant');
reset role;
create function pg_temp.submit(choices jsonb) returns jsonb language sql as $$
 select public.use_signature_request(encode(extensions.digest((select data->>'token' from capabilities where label='first'),'sha256'),'hex'),'sign',
 jsonb_build_object('request_id',gen_random_uuid(),'snapshot_hash',(select snapshot_hash from app_private.signature_payloads where request_id=(select (data->'link'->>'id')::uuid from capabilities where label='first')),
 'signer_name','Synthetic Signer','confirmed',true,'signature','[[[0.1,0.2],[0.2,0.3],[0.3,0.4],[0.4,0.3],[0.5,0.2],[0.6,0.4]]]'::jsonb,'photo_choices',choices));
$$;
select is(pg_temp.submit('{"documentation":false,"demonstration":true}')->>'status','422','demonstration cannot bypass documentation');
select is(pg_temp.submit('{"documentation":"yes","demonstration":false}')->>'status','422','grant types checked at SQL boundary');
select is(pg_temp.submit('{"documentation":true,"demonstration":false,"extra":true}')->>'status','422','unexpected grant purpose rejected');
select is(pg_temp.submit('{"documentation":true,"demonstration":false}')->>'ok','true','independent signed choices accepted');
select is((select count(*)::int from public.photo_permissions),2,'both grant and decline have evidence');
select is((select renderer from public.consents),'glow-pdf-v2','photo evidence uses versioned renderer');
select is((select payload->'photo_choices'->>'demonstration' from app_private.signed_payloads),'false','signed artifact records decline');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
insert into capabilities values('photo',public.prepare_photo('faaaaaaa-1111-4111-8111-111111111111','faaaaaaa-4444-4444-8444-444444444444','before','f0000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa',100,repeat('a',64),'image/jpeg'));
select is(public.prepare_photo('faaaaaaa-1111-4111-8111-111111111111','faaaaaaa-4444-4444-8444-444444444444','before','f0000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa',100,repeat('a',64),'image/jpeg')->>'photo_id',(select data->>'photo_id' from capabilities where label='photo'),'retry returns same photo');
select throws_ok($$select public.prepare_photo('faaaaaaa-1111-4111-8111-111111111111','faaaaaaa-4444-4444-8444-444444444444','after','f0000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa',100,repeat('a',64),'image/jpeg')$$,'23505',null,'retry binds photo category');
select throws_ok($$select public.complete_photo((select (data->>'photo_id')::uuid from capabilities where label='photo'))$$,'22023','FILE_NOT_UPLOADED','unverified file cannot enter gallery');
select throws_ok($$select public.read_photo((select (data->>'photo_id')::uuid from capabilities where label='photo'))$$,'P0002',null,'pending photo cannot be read');
-- Simulate verified Storage completion for policy-only tests.
reset role;
update public.stored_files set state='ready',size_bytes=100,sha256=repeat('b',64),width=10,height=10,ready_at=now() where id=(select (data->>'id')::uuid from capabilities where label='photo');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f3333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select is((select count(*)::int from public.photos),0,'unassigned clinical staff sees no photo metadata');
select is((select count(*)::int from public.photo_permissions),0,'unassigned staff sees no usage choices');
select throws_ok($$select public.complete_photo((select (data->>'photo_id')::uuid from capabilities where label='photo'))$$,'P0002',null,'unassigned staff cannot finalize photos');
select set_config('request.jwt.claims','{"sub":"f2222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select is((select count(*)::int from public.photos),0,'other tenant sees no photo metadata');
select throws_ok($$select public.revoke_photo_permission((select id from public.photo_permissions limit 1),1)$$,'P0002',null,'foreign tenant cannot revoke a permission');
select set_config('request.jwt.claims','{"sub":"f1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select lives_ok($$select public.complete_photo((select (data->>'photo_id')::uuid from capabilities where label='photo'))$$,'owner finalizes a verified photo');
select lives_ok($$select public.complete_photo((select (data->>'photo_id')::uuid from capabilities where label='photo'))$$,'completion retry is idempotent');
select is(public.read_photo((select (data->>'photo_id')::uuid from capabilities where label='photo'))->>'sha256',repeat('b',64),'audited read references verified bytes');
insert into capabilities values('second-photo',public.prepare_photo('faaaaaaa-1111-4111-8111-111111111111','faaaaaaa-4444-4444-8444-444444444444','after',gen_random_uuid(),100,repeat('a',64),'image/jpeg'));
select lives_ok($$select public.revoke_photo_permission((select id from public.photo_permissions where purpose='documentation'),1)$$,'documentation can be revoked independently');
select throws_ok($$select public.complete_photo((select (data->>'photo_id')::uuid from capabilities where label='second-photo'))$$,'22023','PHOTO_PERMISSION_REQUIRED','revocation during upload prevents attachment');
select lives_ok($$select public.read_photo((select (data->>'photo_id')::uuid from capabilities where label='photo'))$$,'existing dossier photo remains private after revocation');
select throws_ok($$select public.revoke_photo_permission((select id from public.photo_permissions where purpose='documentation'),1)$$,'40001',null,'revocation has optimistic concurrency');
select lives_ok($$select public.archive_photo((select (data->>'photo_id')::uuid from capabilities where label='photo'),2)$$,'explicit archive is supported');
select throws_ok($$select public.read_photo((select (data->>'photo_id')::uuid from capabilities where label='photo'))$$,'P0002',null,'archive removes gallery access');
reset role;
select ok((select count(*)>0 from public.audit_log where action='photo.read'),'photo reads are audited');
select is((select count(*)::int from app_private.signed_payloads),1,'revocation and archive never rewrite signed evidence');
select ok((select bool_and(relrowsecurity) from pg_class where oid in('public.photos'::regclass,'public.photo_permissions'::regclass)),'new tables have RLS');
select * from finish();
rollback;
