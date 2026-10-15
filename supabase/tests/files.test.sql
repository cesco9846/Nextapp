begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
('e1111111-1111-4111-8111-111111111111','files-a@example.invalid',now(),'{}','{}'),
('e2222222-2222-4222-8222-222222222222','files-b@example.invalid',now(),'{}','{}'),
('e3333333-3333-4333-8333-333333333333','files-staff@example.invalid',now(),'{}','{}');
insert into public.tenants(id,name) values ('eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Files A'),('ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Files B');
insert into public.users(id,tenant_id,display_name,role,clinical_access) values
('e1111111-1111-4111-8111-111111111111','eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Owner A','owner',true),
('e2222222-2222-4222-8222-222222222222','ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Owner B','owner',true),
('e3333333-3333-4333-8333-333333333333','eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Operator','operator',true);
insert into public.clients(id,tenant_id,first_name,last_name) values
('eaaaaaaa-1111-4111-8111-111111111111','eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Client','A'),
('ebbbbbbb-1111-4111-8111-111111111111','ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Client','B');
create temporary table file_result(id uuid);
grant all on file_result to authenticated,service_role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
insert into file_result select (public.prepare_client_file('eaaaaaaa-1111-4111-8111-111111111111','eaaaaaaa-2222-4222-8222-222222222222',100,repeat('a',64),'image/jpeg')).id;
select is((select state from public.stored_files where id=(select id from file_result)),'pending','preparation is not readiness');
select is((public.prepare_client_file('eaaaaaaa-1111-4111-8111-111111111111','eaaaaaaa-2222-4222-8222-222222222222',100,repeat('a',64),'image/jpeg')).id,(select id from file_result),'same request returns the same file');
select throws_ok($$select public.prepare_client_file('eaaaaaaa-1111-4111-8111-111111111111','eaaaaaaa-2222-4222-8222-222222222222',101,repeat('a',64),'image/jpeg')$$,'23505',null,'request id cannot change payload');
select throws_ok($$select public.prepare_client_file('ebbbbbbb-1111-4111-8111-111111111111',gen_random_uuid(),100,repeat('a',64),'image/jpeg')$$,'42501',null,'cannot prepare for another tenant');
select throws_ok($$select public.prepare_client_file('eaaaaaaa-1111-4111-8111-111111111111',gen_random_uuid(),10485761,repeat('a',64),'image/jpeg')$$,'22023',null,'size limit enforced at RPC boundary');
select throws_ok($$select public.prepare_client_file('eaaaaaaa-1111-4111-8111-111111111111',gen_random_uuid(),100,repeat('a',64),'image/svg+xml')$$,'22023',null,'active formats not accepted');
select throws_ok($$select public.prepare_client_file('eaaaaaaa-1111-4111-8111-111111111111',gen_random_uuid(),100,null,'image/jpeg')$$,'22023',null,'null hash rejected');
select throws_ok($$update public.stored_files set state='ready'$$,'42501',null,'client cannot finalize metadata directly');
select throws_ok($$select public.finish_client_file((select id from file_result),auth.uid(),repeat('b',64),100,10,10)$$,'42501',null,'client cannot call trusted finalizer');
select throws_ok($$select public.claim_file_cleanup(50)$$,'42501',null,'client cannot claim cleanup');
select throws_ok($$select public.authorize_file_read((select id from file_result))$$,'P0002',null,'pending file has no read capability');
select ok(app_private.file_upload_allowed((select upload_path from public.stored_files where id=(select id from file_result))),'pending upload owned by current user is allowed');
select ok(not app_private.file_upload_allowed((select object_path from public.stored_files where id=(select id from file_result))),'canonical path cannot be uploaded by user');
select set_config('request.jwt.claims','{"sub":"e2222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select is((select count(*)::int from public.stored_files),0,'another studio cannot list file metadata');
select throws_ok($$select public.file_for_completion((select id from file_result))$$,'P0002',null,'another owner cannot complete a file');
select set_config('request.jwt.claims','{"sub":"e3333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select throws_ok($$select public.prepare_client_file('eaaaaaaa-1111-4111-8111-111111111111',gen_random_uuid(),100,repeat('a',64),'image/jpeg')$$,'42501',null,'clinical flag alone does not allow file upload');
select set_config('request.jwt.claims','{"sub":"e1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select public.cancel_client_file((select id from file_result));
select is((select state from public.stored_files where id=(select id from file_result)),'failed','cancellation leaves recoverable cleanup metadata');
select ok(not app_private.file_upload_allowed((select upload_path from public.stored_files where id=(select id from file_result))),'cancelled upload cannot race cleanup');
reset role;
select ok(not (select public from storage.buckets where id='glow-private'),'bucket is private');
select is((select file_size_limit from storage.buckets where id='glow-private'),10485760::bigint,'Storage also enforces maximum upload bytes');
set local role service_role;
create temporary table claims as select value as data from public.claim_file_cleanup(50) value;
select is((select count(*)::int from claims),1,'cleanup claims failed upload');
select is((select state from public.stored_files where id=(select id from file_result)),'discarded','claim closes upload before object deletion');
select is((select count(*)::int from public.claim_file_cleanup(50)),0,'active lease prevents duplicate claim');
select throws_ok($$select public.complete_file_cleanup((select id from file_result),gen_random_uuid())$$,'40001',null,'unrelated claim cannot acknowledge deletion');
select public.complete_file_cleanup((select id from file_result),(select (data->>'claim')::uuid from claims));
select ok((select cleanup_completed_at is not null from public.stored_files where id=(select id from file_result)),'cleanup acknowledgment retained');
select is((select count(*)::int from public.claim_file_cleanup(50)),0,'acknowledged cleanup not reclaimed');
set local role anon;
select throws_ok($$select * from public.stored_files$$,'42501',null,'anonymous metadata access denied');
select throws_ok($$select public.authorize_file_read(gen_random_uuid())$$,'42501',null,'anonymous signing authorization denied');
reset role;
-- Rate accounting retains cancelled/discarded metadata, preventing quota reset
-- by repeatedly cancelling uploads or running cleanup.
with ids as (select gen_random_uuid() as id from generate_series(1,99))
insert into public.stored_files(id,tenant_id,client_id,created_by,request_id,upload_path,object_path,expected_size,expected_sha256,mime_type)
select id,'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','eaaaaaaa-1111-4111-8111-111111111111','e1111111-1111-4111-8111-111111111111',gen_random_uuid(),
'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/'||id::text||'/upload','eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/'||id::text||'/image',100,repeat('a',64),'image/jpeg' from ids;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select throws_ok($$select public.prepare_client_file('eaaaaaaa-1111-4111-8111-111111111111',gen_random_uuid(),100,repeat('a',64),'image/jpeg')$$,'54000',null,'persistent hourly rate limit includes discarded uploads');
reset role;
select * from finish();
rollback;
