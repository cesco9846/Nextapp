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
grant all on capabilities,results to authenticated,service_role;
insert into capabilities values('first',public.create_intake_link('f0000000-8888-4888-8888-888888888888','faaaaaaa-4444-4444-8444-444444444444',1,1,'link'));
select ok((select data->>'token' ~ '^[a-f0-9]{64}$' from capabilities where label='first'),'issued capability has 256 random bits');
select is((public.create_intake_link('f0000000-8888-4888-8888-888888888888','faaaaaaa-4444-4444-8444-444444444444',1,1,'link')->>'token'),null,'retry never recovers a persisted plaintext token');
select throws_ok($$select public.create_intake_link('f0000000-8888-4888-8888-888888888888','faaaaaaa-4444-4444-8444-444444444444',1,1,'tablet')$$,'23505',null,'issuance idempotency binds its purpose and versions');
select throws_ok($$select public.create_intake_link(gen_random_uuid(),'faaaaaaa-4444-4444-8444-444444444444',null,1,'link')$$,'40001',null,'issuance rejects a null appointment revision');
select throws_ok($$select public.create_intake_link(gen_random_uuid(),'faaaaaaa-4444-4444-8444-444444444444',1,1,'other')$$,'22023',null,'purpose cannot be widened');
select throws_ok($$select * from app_private.intake_capabilities$$,'42501',null,'owner cannot select token hashes directly');
select throws_ok($$select * from app_private.intake_receipts$$,'42501',null,'owner cannot select private receipt hashes');
select throws_ok($$select public.use_intake_link(repeat('a',64),'read',null,null,null)$$,'42501',null,'authenticated users cannot bypass public gateway');
reset role;
select is((select count(*)::int from app_private.intake_capabilities cap join capabilities x on cap.link_id=(x.data->'link'->>'id')::uuid where cap.token_hash=encode(extensions.digest(x.data->>'token','sha256'),'hex')),1,'only the SHA256 token digest is stored');
set local role anon;
select throws_ok($$select * from public.intake_links$$,'42501',null,'anonymous metadata is denied by grants');
select throws_ok($$select public.use_intake_link(repeat('a',64),'read',null,null,null)$$,'42501',null,'anonymous direct RPC is denied');
reset role;
create function pg_temp.intake(label text,operation text,request uuid default null,answers jsonb default null,confirmed boolean default null) returns jsonb language sql as $$
 select public.use_intake_link(encode(extensions.digest((select data->>'token' from capabilities where capabilities.label=$1),'sha256'),'hex'),$2,$3,$4,$5);
$$;
set local role service_role;
select set_config('request.jwt.claims','{}',true);
insert into capabilities values('read',pg_temp.intake('first','read'));
select is((select data->>'ok' from capabilities where label='read'),'true','public capability opens its limited form');
select is((select data->'context'->>'first_name' from capabilities where label='read'),'Synthetic','only intended first name is returned');
select ok((select not(data->'context' ? 'answers') and not(data->'context' ? 'lots') and not(data->'context' ? 'client_id') and not(data->'context' ? 'last_name') from capabilities where label='read'),'read DTO excludes prior answers, file references and patient identifiers');
select is(pg_temp.intake('first','read')->>'ok','true','reading again does not consume capability');
select is(pg_temp.intake('first','submit',gen_random_uuid(),'{}',true)->>'status','422','required answer cannot be omitted');
select is(pg_temp.intake('first','submit',gen_random_uuid(),'{"f9999999-1111-4111-8111-111111111111":"yes"}',true)->>'status','422','answer type is checked on server');
select is(pg_temp.intake('first','submit',gen_random_uuid(),'{"f9999999-1111-4111-8111-111111111111":true,"unknown":true}',true)->>'status','422','unknown answer keys rejected');
select is(pg_temp.intake('first','submit',gen_random_uuid(),'{"f9999999-1111-4111-8111-111111111111":false}',false)->>'status','422','explicit reading acknowledgement required');
reset role;
select is((select used_at from public.intake_links where id=(select (data->'link'->>'id')::uuid from capabilities where label='first')),null,'invalid submissions leave capability usable');
select is((select version from public.treatment_preparations where id=(select id from results where label='preparation')),1,'invalid submission preserves preparation');
select is((select count(*)::int from public.audit_log where tenant_id='faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and action='intake.read'),2,'every successful form read is audited');
select is((select count(*)::int from public.audit_log where tenant_id='faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and action='intake.read' and actor_id is not null),0,'client reads do not impersonate professional');
create function pg_temp.fail_intake_audit() returns trigger language plpgsql as $$ begin if new.action in('intake.read','intake.submitted') then raise exception 'AUDIT_UNAVAILABLE' using errcode='XX000'; end if; return new; end; $$;
create trigger fail_intake_audit before insert on public.audit_log for each row execute function pg_temp.fail_intake_audit();
set local role service_role;
select throws_ok($$select pg_temp.intake('first','read')$$,'XX000','AUDIT_UNAVAILABLE','audit failure blocks public document read');
select throws_ok($$select pg_temp.intake('first','submit','f0000000-9999-4999-8999-999999999999','{"f9999999-1111-4111-8111-111111111111":false}',true)$$,'XX000','AUDIT_UNAVAILABLE','submission audit failure aborts entire operation');
reset role;
drop trigger fail_intake_audit on public.audit_log;
select is((select version from public.treatment_preparations where id=(select id from results where label='preparation')),1,'failed audit rolled back answer write/version');
select is((select count(*)::int from app_private.intake_receipts where link_id=(select (data->'link'->>'id')::uuid from capabilities where label='first')),0,'failed audit rolled back receipt and consumption');
set local role service_role;
insert into capabilities values('submitted',pg_temp.intake('first','submit','f0000000-9999-4999-8999-999999999999','{"f9999999-1111-4111-8111-111111111111":false}',true));
select is((select data->>'ok' from capabilities where label='submitted'),'true','false is a valid required yes/no answer');
select is(pg_temp.intake('first','submit','f0000000-9999-4999-8999-999999999999','{"f9999999-1111-4111-8111-111111111111":false}',true)->'receipt',(select data->'receipt' from capabilities where label='submitted'),'identical retry returns original receipt');
select is(pg_temp.intake('first','submit',gen_random_uuid(),'{"f9999999-1111-4111-8111-111111111111":false}',true)->>'status','410','another submission cannot reuse consumed token');
select is(pg_temp.intake('first','submit','f0000000-9999-4999-8999-999999999999','{"f9999999-1111-4111-8111-111111111111":true}',true)->>'status','410','changed retry cannot replace accepted answers');
select is(pg_temp.intake('first','read')->>'status','410','used capability never reopens answers');
reset role;
select is((select version from public.treatment_preparations where id=(select id from results where label='preparation')),2,'one accepted submission advances preparation once');
select is((select updated_by from public.treatment_preparations where id=(select id from results where label='preparation')),null,'client submission is not attributed to issuer');
select is((select answers->>'f9999999-1111-4111-8111-111111111111' from app_private.preparation_answers where preparation_id=(select id from results where label='preparation')),'false','private answers saved atomically');
select is((select count(*)::int from app_private.intake_receipts where link_id=(select (data->'link'->>'id')::uuid from capabilities where label='first')),1,'receipt unique per link');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
insert into capabilities values('expired',public.create_intake_link(gen_random_uuid(),'faaaaaaa-4444-4444-8444-444444444444',1,2,'link'));
reset role;
update public.intake_links set created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where id=(select (data->'link'->>'id')::uuid from capabilities where label='expired');
set local role service_role;
select set_config('request.jwt.claims','{}',true);
select is(pg_temp.intake('expired','read')->>'status','410','expired capability denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
insert into capabilities values('revoked',public.create_intake_link(gen_random_uuid(),'faaaaaaa-4444-4444-8444-444444444444',1,2,'link'));
select lives_ok($$select public.revoke_intake_link((select (data->'link'->>'id')::uuid from capabilities where label='revoked'),1)$$,'authorized professional can revoke');
insert into capabilities values('changed',public.create_intake_link(gen_random_uuid(),'faaaaaaa-4444-4444-8444-444444444444',1,2,'link'));
select set_config('request.jwt.claims','{"sub":"f2222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select is((select count(*)::int from public.intake_links),0,'other tenant cannot read metadata');
select throws_ok($$select public.revoke_intake_link((select (data->'link'->>'id')::uuid from capabilities where label='changed'),1)$$,'P0002',null,'other tenant cannot revoke capability');
select set_config('request.jwt.claims','{"sub":"f3333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select is((select count(*)::int from public.intake_links),0,'clinical flag alone does not expose link metadata');
select throws_ok($$select public.create_intake_link(gen_random_uuid(),'faaaaaaa-4444-4444-8444-444444444444',1,2,'link')$$,'P0002',null,'unassigned clinician cannot issue link');
reset role;
update public.treatment_preparations set version=version+1 where id=(select id from results where label='preparation');
set local role service_role;
select set_config('request.jwt.claims','{}',true);
select is(pg_temp.intake('revoked','read')->>'status','410','revoked capability denied');
select is(pg_temp.intake('changed','read')->>'status','410','preparation edits invalidate open capability');
reset role;
-- Rejected-token attempts must persist rather than rolling back the counter.
do $$ declare result jsonb; begin for n in 1..70 loop result:=public.use_public_link(repeat('f',64),'intake',repeat('e',64),'read');exit when result->>'status'='429';end loop;end;$$;
select ok(exists(select 1 from app_private.public_link_limits where scope='invalid-source' and key_hash=repeat('f',64) and attempts=61),'invalid capability attempts are persisted and limited');
select ok(not exists(select 1 from app_private.intake_rate_limits where key='global'),'invalid attempts never spend a global quota');
select is((select count(*)::int from public.audit_log where tenant_id='faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and action='intake.submitted'),1,'one completed submission has one explicit audit event');
insert into app_private.intake_rate_limits(key,window_start,attempts) values('old-fixture',date_trunc('minute',clock_timestamp())-interval '2 hours',1);
do $$ declare result jsonb; begin
 for n in 1..350 loop
  result:=public.use_public_link(repeat('a',64),'intake',encode(extensions.digest(n::text,'sha256'),'hex'),'read');
  exit when result->>'status'='429';
 end loop;
 insert into capabilities values('global-rate',result);
end;$$;
select is((select data->>'status' from capabilities where label='global-rate'),'429','rotating invalid tokens cannot bypass their source limit');
do $$begin perform app_private.prune_reminder_logs();end;$$;
select is((select count(*)::int from app_private.intake_rate_limits where key='old-fixture'),0,'hourly cleanup removes expired legacy windows');
set constraints all immediate;
select * from finish();
rollback;
