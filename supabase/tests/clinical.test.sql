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
select is((select count(*)::int from public.clinical_template_versions),2,'owner publishes versioned texts');
select is((public.publish_clinical_template('f0000000-1111-4111-8111-111111111111',null,0,'consent','Consenso di prova','Testo sintetico non destinato a uso reale.','[]',null)).id,(select id from results where label='consent'),'publish retry is idempotent');
select throws_ok($$select public.publish_clinical_template('f0000000-1111-4111-8111-111111111111',null,0,'consent','Changed','Changed synthetic content','[]',null)$$,'23505',null,'request cannot silently change content');
select throws_ok($$select public.publish_clinical_template(gen_random_uuid(),null,0,'anamnesis','Invalid questions','Synthetic invalid questions.','[{"id":"missing fields"}]',null)$$,'22023',null,'question shape validated in database');
select throws_ok($$select public.publish_clinical_template(gen_random_uuid(),null,0,'consent','Invalid questions','Synthetic invalid consent.','[{"id":"f9999999-1111-4111-8111-111111111111","label":"Q","type":"text","required":false}]',null)$$,'22023',null,'consent cannot smuggle questionnaire');
select throws_ok($$update public.clinical_template_versions set body='Changed content'$$,'42501',null,'users cannot mutate published versions');
insert into results values('pigment',(public.save_pigment('f0000000-3333-4333-8333-333333333333',null,0,'Brand A','Pigment A','CODE',true)).id);
select throws_ok($$select public.save_pigment(gen_random_uuid(),(select id from results where label='pigment'),null,'Brand','Pigment','',true)$$,'40001',null,'null pigment version cannot bypass optimistic guard');
reset role;
-- Trusted fixture: policy tests do not pretend this is a real Storage upload.
insert into public.stored_files(id,tenant_id,pigment_id,kind,created_by,request_id,state,upload_path,object_path,expected_size,expected_sha256,mime_type,size_bytes,sha256,width,height,ready_at)
values('faaaaaaa-5555-4555-8555-555555555555','faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',(select id from results where label='pigment'),'pigment_label','f1111111-1111-4111-8111-111111111111',gen_random_uuid(),'ready','faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/faaaaaaa-5555-4555-8555-555555555555/upload','faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/faaaaaaa-5555-4555-8555-555555555555/image',100,repeat('a',64),'image/jpeg',100,repeat('b',64),10,10,now());
set local role authenticated;
insert into results values('lot',(public.save_pigment_lot('f0000000-4444-4444-8444-444444444444',null,0,(select id from results where label='pigment'),'LOT-1',current_date+365,'faaaaaaa-5555-4555-8555-555555555555','Synthetic label',true)).id);
select throws_ok($$select public.save_pigment_lot(gen_random_uuid(),null,0,(select id from results where label='pigment'),'LOT-2',current_date+365,gen_random_uuid(),'',true)$$,'22023',null,'lot requires verified label for its pigment');
insert into results values('preparation',(public.save_treatment_preparation('f0000000-5555-4555-8555-555555555555','faaaaaaa-4444-4444-8444-444444444444',1,0,(select id from results where label='consent'),(select id from results where label='anamnesis'),'{"f9999999-1111-4111-8111-111111111111":true}',array[(select id from results where label='lot')])).id);
select is((public.save_treatment_preparation('f0000000-5555-4555-8555-555555555555','faaaaaaa-4444-4444-8444-444444444444',1,0,(select id from results where label='consent'),(select id from results where label='anamnesis'),'{"f9999999-1111-4111-8111-111111111111":true}',array[(select id from results where label='lot')])).id,(select id from results where label='preparation'),'preparation retry does not duplicate');
select is((select count(*)::int from public.treatment_preparations),1,'one preparation per appointment');
select throws_ok($$select * from app_private.preparation_answers$$,'42501',null,'answers have no direct read even for owner');
select is((public.read_treatment_preparation('faaaaaaa-4444-4444-8444-444444444444')->'answers'->>'f9999999-1111-4111-8111-111111111111'),'true','audited RPC returns authorized answer');
select is((select count(*)::int from public.audit_log where action='anamnesis.read'),1,'read creates audit before returning');
select throws_ok($$select public.save_treatment_preparation(gen_random_uuid(),'faaaaaaa-4444-4444-8444-444444444444',1,1,(select id from results where label='consent'),(select id from results where label='anamnesis'),'{"f9999999-1111-4111-8111-111111111111":"wrong type"}','{}')$$,'22023',null,'yes/no answers cannot accept strings');
select throws_ok($$select public.save_treatment_preparation(gen_random_uuid(),'faaaaaaa-4444-4444-8444-444444444444',1,1,(select id from results where label='consent'),null,'{"unknown":true}','{}')$$,'22023',null,'answers cannot refer to unknown questions');
select throws_ok($$select public.save_treatment_preparation(gen_random_uuid(),'faaaaaaa-4444-4444-8444-444444444444',1,null,(select id from results where label='consent'),null,'{}','{}')$$,'40001',null,'null preparation version rejected');
select throws_ok($$select public.save_treatment_preparation(gen_random_uuid(),'faaaaaaa-4444-4444-8444-444444444444',999,1,(select id from results where label='consent'),null,'{}','{}')$$,'40001',null,'appointment changes cannot be overwritten by stale preparation');
select public.publish_clinical_template(gen_random_uuid(),(select template_id from public.clinical_template_versions where id=(select id from results where label='consent')),1,'consent','Consenso aggiornato','Nuovo testo sintetico immutabile.','[]',null);
select is((public.read_treatment_preparation('faaaaaaa-4444-4444-8444-444444444444')->'consent'->>'body'),'Testo sintetico non destinato a uso reale.','prepared text remains pinned after publication');
select throws_ok($$select public.publish_clinical_template(gen_random_uuid(),(select template_id from public.clinical_template_versions where id=(select id from results where label='consent')),1,'consent','Stale edit','Stale synthetic text.','[]',null)$$,'40001',null,'stale publication cannot overwrite another version');
select public.save_pigment(gen_random_uuid(),(select id from results where label='pigment'),1,'Renamed brand','Renamed pigment','NEW',true);
select is((select snapshot->>'brand' from public.treatment_lots where preparation_id=(select id from results where label='preparation')),'Brand A','historical lot snapshot independent of catalog rename');
select public.save_pigment_lot(gen_random_uuid(),(select id from results where label='lot'),1,(select id from results where label='pigment'),'LOT-1',current_date+1,'faaaaaaa-5555-4555-8555-555555555555','Changed label text',true);
select throws_ok($$select public.save_treatment_preparation(gen_random_uuid(),'faaaaaaa-4444-4444-8444-444444444444',1,1,(select id from results where label='consent'),null,'{}',array[(select id from results where label='lot')])$$,'22023',null,'lot expiring before appointment is unusable even if valid today');
select is((select snapshot->>'label_text' from public.treatment_lots where preparation_id=(select id from results where label='preparation')),'Synthetic label','failed update cannot change previously selected label snapshot');
select set_config('request.jwt.claims','{"sub":"f2222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select is((select count(*)::int from public.clinical_templates),0,'tenant B cannot list templates A');
select is((select count(*)::int from public.treatment_lots),0,'tenant B cannot read selected materials A');
select throws_ok($$select public.read_treatment_preparation('faaaaaaa-4444-4444-8444-444444444444')$$,'P0002',null,'another studio cannot read anamnesis');
select set_config('request.jwt.claims','{"sub":"f3333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select throws_ok($$select public.publish_clinical_template(gen_random_uuid(),null,0,'consent','Escalation','Synthetic text for permission test.','[]',null)$$,'42501',null,'clinical staff cannot publish');
select throws_ok($$select public.prepare_pigment_label((select id from results where label='pigment'),gen_random_uuid(),100,repeat('a',64),'image/jpeg')$$,'42501',null,'clinical staff cannot upload manufacturer catalog labels');
select throws_ok($$select public.read_treatment_preparation('faaaaaaa-4444-4444-8444-444444444444')$$,'P0002',null,'clinical flag alone cannot read unassigned client');
select set_config('request.jwt.claims','{"sub":"f1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select public.set_client_assignment('faaaaaaa-1111-4111-8111-111111111111','f3333333-3333-4333-8333-333333333333',true,0);
select set_config('request.jwt.claims','{"sub":"f3333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select is((public.read_treatment_preparation('faaaaaaa-4444-4444-8444-444444444444')->'answers'->>'f9999999-1111-4111-8111-111111111111'),'true','flag plus assignment allows audited access');
select throws_ok($$select * from app_private.preparation_answers$$,'42501',null,'assigned staff still cannot bypass read audit');
select set_config('request.jwt.claims','{"sub":"f1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select public.set_client_assignment('faaaaaaa-1111-4111-8111-111111111111','f3333333-3333-4333-8333-333333333333',false,1);
select set_config('request.jwt.claims','{"sub":"f3333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select throws_ok($$select public.read_treatment_preparation('faaaaaaa-4444-4444-8444-444444444444')$$,'P0002',null,'assignment revocation blocks subsequent reads');
reset role;
select throws_ok($$update public.clinical_template_versions set body='Even privileged edits cannot rewrite publication'$$,'55000',null,'published content protected against direct privileged rewrite');
-- An audit storage failure must prevent returning health answers.
create function pg_temp.reject_audit() returns trigger language plpgsql as $$begin if new.action='anamnesis.read' then raise exception 'AUDIT_UNAVAILABLE'; end if;return new;end;$$;
create trigger test_audit_failure before insert on public.audit_log for each row execute function pg_temp.reject_audit();
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select throws_ok($$select public.read_treatment_preparation('faaaaaaa-4444-4444-8444-444444444444')$$,'P0001',null,'failed audit blocks clinical response');
set local role anon;
select throws_ok($$select * from public.clinical_templates$$,'42501',null,'anonymous catalog access denied');
select throws_ok($$select public.read_treatment_preparation(gen_random_uuid())$$,'42501',null,'anonymous audited RPC denied');
reset role;
set constraints all immediate;
select * from finish();
rollback;
