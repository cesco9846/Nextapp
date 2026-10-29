begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at) values
 ('31000000-0000-4000-8000-000000000001','session-profile@example.invalid',now()),
 ('31000000-0000-4000-8000-000000000002','session-foreign@example.invalid',now());
insert into public.tenants(id,name) values('31000000-0000-4000-8000-000000000010','Session fixture');
insert into public.users(id,tenant_id,display_name,role) values
 ('31000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000010','Own fixture','owner');
insert into auth.sessions(id,user_id) values
 ('31000000-0000-4000-8000-000000000020','31000000-0000-4000-8000-000000000001'),
 ('31000000-0000-4000-8000-000000000021','31000000-0000-4000-8000-000000000002');
select ok(not has_function_privilege('anon','public.session_profile()','execute'),'profile requires authentication');
select ok(not has_function_privilege('service_role','public.session_profile()','execute'),'machine token cannot impersonate a session');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.session_profile()$$,'28000','SESSION_REVOKED','user id without live session is not enough');
select set_config('request.jwt.claims','{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"31000000-0000-4000-8000-000000000021"}',true);
select throws_ok($$select public.session_profile()$$,'28000','SESSION_REVOKED','another user session is rejected');
select set_config('request.jwt.claims','{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"31000000-0000-4000-8000-000000000020"}',true);
select is((select id::text from public.session_profile()),'31000000-0000-4000-8000-000000000001','valid session returns only its own profile');
reset role;
update public.users set active=false where id='31000000-0000-4000-8000-000000000001';
set local role authenticated;
select is((select active from public.session_profile()),false,'suspension is visible without caching a previous profile');
reset role;
update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id='31000000-0000-4000-8000-000000000020';
set local role authenticated;
select throws_ok($$select public.session_profile()$$,'28000','SESSION_REVOKED','expired session rejected');
reset role;
delete from auth.sessions where id='31000000-0000-4000-8000-000000000020';
set local role authenticated;
select throws_ok($$select public.session_profile()$$,'28000','SESSION_REVOKED','signed access token cannot restore a logged-out session');
reset role;
select ok(not has_table_privilege('authenticated','auth.sessions','select'),'session table remains private');
select * from finish();
rollback;
