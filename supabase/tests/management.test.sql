begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
 ('28111111-1111-4111-8111-111111111111','management-owner@example.invalid',now(),'{}','{}'),
 ('28222222-2222-4222-8222-222222222222','management-foreign@example.invalid',now(),'{}','{}'),
 ('28333333-3333-4333-8333-333333333333','management-operator@example.invalid',now(),'{}','{}');
insert into public.tenants(id,name) values('28aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Studio iniziale'),('28bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Altro studio');
insert into public.users(id,tenant_id,display_name,role,clinical_access) values
 ('28111111-1111-4111-8111-111111111111','28aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Owner','owner',true),
 ('28222222-2222-4222-8222-222222222222','28bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Foreign','owner',true),
 ('28333333-3333-4333-8333-333333333333','28aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Operator','operator',true);
insert into public.clients(id,tenant_id,first_name,last_name) values
 ('28aaaaaa-1111-4111-8111-111111111111','28aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Unused','Synthetic'),
 ('28aaaaaa-2222-4222-8222-222222222222','28aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','History','Synthetic'),
 ('28aaaaaa-3333-4333-8333-333333333333','28aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Privacy','Synthetic'),
 ('28aaaaaa-4444-4444-8444-444444444444','28aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','File','Synthetic'),
 ('28aaaaaa-5555-4555-8555-555555555555','28aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Export','Synthetic');
insert into public.stored_files(id,tenant_id,client_id,created_by,request_id,upload_path,object_path,expected_size,expected_sha256,mime_type)
values('28000000-5555-4555-8555-555555555555','28aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','28aaaaaa-4444-4444-8444-444444444444','28111111-1111-4111-8111-111111111111',gen_random_uuid(),
 '28aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/28000000-5555-4555-8555-555555555555/upload','28aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/28000000-5555-4555-8555-555555555555/image',100,repeat('a',64),'image/jpeg');
create temporary table management_results(label text primary key,data jsonb);
grant all on management_results to authenticated,service_role;
insert into public.services(id,tenant_id,name,duration_minutes) values
 ('28000000-1111-4111-8111-111111111111','28aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Unused service',60),
 ('28000000-2222-4222-8222-222222222222','28aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','History service',60),
 ('28000000-3333-4333-8333-333333333333','28aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Template service',60);
insert into public.locations(id,tenant_id,name) values('28000000-4444-4444-8444-444444444444','28aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Location');
insert into public.appointments(tenant_id,client_id,service_id,operator_id,location_id,service_name,price_cents,starts_at,ends_at,status)
values('28aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','28aaaaaa-2222-4222-8222-222222222222','28000000-2222-4222-8222-222222222222','28111111-1111-4111-8111-111111111111','28000000-4444-4444-8444-444444444444','History service',5000,now()-interval '2 days',now()-interval '2 days'+interval '1 hour','cancelled');
insert into public.client_assignments(tenant_id,client_id,operator_id,assigned_by) values('28aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','28aaaaaa-1111-4111-8111-111111111111','28333333-3333-4333-8333-333333333333','28111111-1111-4111-8111-111111111111');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"28111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select lives_ok($$select public.rename_workspace('  Studio nuovo  ',1)$$,'owner renames studio');
select is((select name from public.tenants),'Studio nuovo','studio name trimmed');
select is((select name_version from public.tenants),2,'rename increments dedicated revision');
select lives_ok($$select public.rename_workspace('Studio nuovo',2)$$,'identical save is harmless');
select is((select name_version from public.tenants),2,'identical save does not churn revision');
select throws_ok($$select public.rename_workspace('Overwritten',1)$$,'40001',null,'stale rename rejected');
select throws_ok($$select public.rename_workspace(' ',2)$$,'22023',null,'empty name rejected');
select throws_ok($$update public.tenants set name='Bypass'$$,'42501',null,'direct tenant update denied');
select is(public.inspect_deletion('clients','28aaaaaa-1111-4111-8111-111111111111')->>'allowed','true','unused client can be removed');
select is(public.inspect_deletion('clients','28aaaaaa-2222-4222-8222-222222222222')->>'allowed','false','past cancelled appointment protects client');
select is(public.inspect_deletion('clients','28aaaaaa-4444-4444-8444-444444444444')->'reasons','["client_files"]'::jsonb,'pending upload protects client too');
select throws_ok($$select public.delete_unused_resource('clients','28aaaaaa-4444-4444-8444-444444444444',1,'ELIMINA')$$,'P0001','RESOURCE_IN_USE','file metadata cannot become orphaned');
select is(public.inspect_deletion('services','28000000-2222-4222-8222-222222222222')->'reasons','["appointments"]'::jsonb,'past cancelled appointment protects service');
select throws_ok($$select public.delete_unused_resource('services','28000000-2222-4222-8222-222222222222',1,'ELIMINA')$$,'P0001','RESOURCE_IN_USE','referenced service cannot be deleted');
select throws_ok($$select public.delete_unused_resource('clients','28aaaaaa-2222-4222-8222-222222222222',1,'ELIMINA')$$,'P0001','RESOURCE_IN_USE','referenced client cannot be deleted');
select lives_ok($$select public.publish_clinical_template(gen_random_uuid(),null,0,'consent','Template sintetico','Testo sintetico per collaudo, non valido per trattamenti.','[]','28000000-3333-4333-8333-333333333333')$$,'service-specific template fixture');
select is(public.inspect_deletion('services','28000000-3333-4333-8333-333333333333')->'reasons','["clinical_templates"]'::jsonb,'clinical template protects service');
select throws_ok($$select public.delete_unused_resource('services','28000000-3333-4333-8333-333333333333',1,'ELIMINA')$$,'P0001','RESOURCE_IN_USE','template reference blocks deletion');
select lives_ok($$select public.create_privacy_request(gen_random_uuid(),'28aaaaaa-3333-4333-8333-333333333333')$$,'privacy request fixture');
select is(public.inspect_deletion('clients','28aaaaaa-3333-4333-8333-333333333333')->'reasons','["privacy_requests"]'::jsonb,'privacy history protects client');
select throws_ok($$select public.delete_unused_resource('clients','28aaaaaa-1111-4111-8111-111111111111',1,'')$$,'22023',null,'confirmation required');
select throws_ok($$select public.delete_unused_resource('clients','28aaaaaa-1111-4111-8111-111111111111',null,'ELIMINA')$$,'40001',null,'null expected revision rejected');
select throws_ok($$select public.delete_unused_resource('clients','28aaaaaa-1111-4111-8111-111111111111',2,'ELIMINA')$$,'40001',null,'stale client version rejected');
select throws_ok($$delete from public.clients where id='28aaaaaa-1111-4111-8111-111111111111'$$,'42501',null,'direct deletion cannot bypass guards');
select throws_ok($$delete from public.services where id='28000000-1111-4111-8111-111111111111'$$,'42501',null,'direct service deletion denied');
select lives_ok($$update public.services set name='Changed service' where id='28000000-1111-4111-8111-111111111111'$$,'existing catalog edits remain supported');
select is((select version from public.services where id='28000000-1111-4111-8111-111111111111'),2,'all service edits increment revision');
select throws_ok($$select public.delete_unused_resource('services','28000000-1111-4111-8111-111111111111',1,'ELIMINA')$$,'40001',null,'stale service deletion rejected');
select set_config('request.jwt.claims','{"sub":"28333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select throws_ok($$select public.rename_workspace('Operator name',2)$$,'42501',null,'operator cannot rename');
select throws_ok($$select public.inspect_deletion('clients','28aaaaaa-1111-4111-8111-111111111111')$$,'42501',null,'operator cannot inspect protected deletion');
select throws_ok($$select public.delete_unused_resource('services','28000000-1111-4111-8111-111111111111',2,'ELIMINA')$$,'42501',null,'operator cannot delete service');
select set_config('request.jwt.claims','{"sub":"28222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select throws_ok($$select public.inspect_deletion('clients','28aaaaaa-1111-4111-8111-111111111111')$$,'P0002',null,'foreign tenant cannot inspect client');
select throws_ok($$select public.delete_unused_resource('services','28000000-1111-4111-8111-111111111111',2,'ELIMINA')$$,'P0002',null,'foreign tenant cannot delete service');
select is((select name from public.tenants),'Altro studio','foreign studio unchanged');
select set_config('request.jwt.claims','{"sub":"28111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select is(public.delete_unused_resource('clients','28aaaaaa-1111-4111-8111-111111111111',1,'ELIMINA'),true,'unused client deleted');
select is(public.delete_unused_resource('clients','28aaaaaa-1111-4111-8111-111111111111',1,'ELIMINA'),true,'lost success response can be retried');
select is(public.delete_unused_resource('services','28000000-1111-4111-8111-111111111111',2,'ELIMINA'),true,'unused service deleted');
reset role;
select is((select count(*)::int from public.client_assignments where client_id='28aaaaaa-1111-4111-8111-111111111111'),0,'unused operational assignments removed');
select is((select count(*)::int from public.audit_log where action='resource.delete' and resource_id='28aaaaaa-1111-4111-8111-111111111111'),1,'deletion retains one minimal audit record');
select is((select count(*)::int from public.appointments where client_id='28aaaaaa-2222-4222-8222-222222222222'),1,'historical appointment preserved');
select is((select service_name from public.appointments where client_id='28aaaaaa-2222-4222-8222-222222222222'),'History service','historical service name unchanged');
set local role authenticated;
insert into management_results values('export',public.prepare_privacy_export('28000000-6666-4666-8666-666666666666','28aaaaaa-5555-4555-8555-555555555555'));
select is(public.inspect_deletion('clients','28aaaaaa-5555-4555-8555-555555555555')->'reasons','["privacy_exports"]'::jsonb,'active temporary copy protects client');
select public.access_privacy_export('28000000-6666-4666-8666-666666666666','revoke');
select is(public.inspect_deletion('clients','28aaaaaa-5555-4555-8555-555555555555')->>'allowed','false','revocation alone does not claim Storage cleanup');
set local role service_role;
insert into management_results values('cleanup',public.claim_privacy_export_cleanup());
select is(public.complete_privacy_export_cleanup('28000000-6666-4666-8666-666666666666',(select (data->0->>'claim')::uuid from management_results where label='cleanup')),true,'empty revoked copy acknowledged after actual absence');
set local role authenticated;
select is(public.inspect_deletion('clients','28aaaaaa-5555-4555-8555-555555555555')->>'allowed','true','cleaned temporary metadata does not block indefinitely');
select is(public.delete_unused_resource('clients','28aaaaaa-5555-4555-8555-555555555555',1,'ELIMINA'),true,'client and cleaned metadata removed atomically');
select is((select count(*)::int from public.privacy_exports where id='28000000-6666-4666-8666-666666666666' and client_id is null),1,'technical tombstone retained without client reference');
select * from finish();
rollback;
