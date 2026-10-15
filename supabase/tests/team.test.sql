begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
 ('d1111111-1111-4111-8111-111111111111','team-owner-a@example.invalid',now(),'{}','{}'),
 ('d2222222-2222-4222-8222-222222222222','team-owner-b@example.invalid',now(),'{}','{}'),
 ('d3333333-3333-4333-8333-333333333333','invited@example.invalid',now(),'{}','{}'),
 ('d4444444-4444-4444-8444-444444444444','other@example.invalid',now(),'{}','{}'),
 ('d5555555-5555-4555-8555-555555555555','unverified@example.invalid',null,'{}','{}');
insert into public.tenants(id,name) values ('daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Team A'),('dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Team B');
insert into public.users(id,tenant_id,display_name,role,clinical_access) values
 ('d1111111-1111-4111-8111-111111111111','daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Owner A','owner',true),
 ('d2222222-2222-4222-8222-222222222222','dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Owner B','owner',true);
insert into public.clients(id,tenant_id,first_name,last_name) values
 ('daaaaaaa-1111-4111-8111-111111111111','daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Client','One'),
 ('daaaaaaa-2222-4222-8222-222222222222','daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Client','Two'),
 ('daaaaaaa-3333-4333-8333-333333333333','daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Client','Three'),
 ('dbbbbbbb-1111-4111-8111-111111111111','dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Other','Tenant');
insert into public.locations(id,tenant_id,name) values ('daaaaaaa-4444-4444-8444-444444444444','daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Location');
insert into public.services(id,tenant_id,name,duration_minutes) values ('daaaaaaa-5555-4555-8555-555555555555','daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Service',60);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
create temporary table invitations(label text primary key, result jsonb);
insert into invitations values ('main',public.create_team_invitation('Invited@EXAMPLE.invalid',true));
select is((select result->>'email' from invitations where label='main'),'invited@example.invalid','invitation normalizes email');
select is((select length(result->>'token') from invitations where label='main'),64,'token carries 256 bits of entropy');
select is((select role from public.user_invitations limit 1),'operator','invitation cannot grant owner role');
select throws_ok($$select token_hash from public.user_invitations$$,'42501',null,'even owners cannot read token hashes through the Data API role');
select throws_ok($$update public.user_invitations set clinical_access=true$$,'42501',null,'invitations cannot bypass RPC validation');
select ok(public.can_access_client_clinical('daaaaaaa-1111-4111-8111-111111111111'),'owner clinical access is scoped to own clients');
select ok(not public.can_access_client_clinical('dbbbbbbb-1111-4111-8111-111111111111'),'owner cannot access another studio clinical client');

select set_config('request.jwt.claims','{"sub":"d4444444-4444-4444-8444-444444444444","role":"authenticated"}',true);
select is(public.membership_state(),'none','new account has no membership');
select throws_ok($$select public.accept_team_invitation((select result->>'token' from invitations where label='main'),'Wrong Person')$$,'22023',null,'a valid token is useless with the wrong email');
select set_config('request.jwt.claims','{"sub":"d5555555-5555-4555-8555-555555555555","role":"authenticated"}',true);
select throws_ok($$select public.accept_team_invitation((select result->>'token' from invitations where label='main'),'Unverified')$$,'42501',null,'unverified identity cannot accept invitation');
select set_config('request.jwt.claims','{"sub":"d2222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select is((select count(*)::int from public.user_invitations),0,'another owner cannot enumerate invitations');
select throws_ok($$select public.revoke_team_invitation((select (result->>'id')::uuid from invitations where label='main'))$$,'P0002',null,'another tenant cannot revoke invitation');

select set_config('request.jwt.claims','{"sub":"d3333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select is(public.accept_team_invitation((select result->>'token' from invitations where label='main'),'Invited Operator'),'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'verified invited email joins intended studio');
select is(public.accept_team_invitation((select result->>'token' from invitations where label='main'),'Retry Operator'),'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'same actor retry is idempotent');
select is((select count(*)::int from public.users where id=auth.uid()),1,'retry keeps a single membership');
select is((select role from public.users where id=auth.uid()),'operator','accepted profile is an operator');
select ok(not public.can_access_client_clinical('daaaaaaa-1111-4111-8111-111111111111'),'clinical flag alone grants no unassigned client access');
select throws_ok($$select public.create_team_invitation('escalation@example.invalid',true)$$,'42501',null,'operator cannot invite another user');
select throws_ok($$update public.users set clinical_access=true where id=auth.uid()$$,'42501',null,'operator cannot edit own permissions directly');
select throws_ok($$select public.set_client_assignment('daaaaaaa-1111-4111-8111-111111111111',auth.uid(),true,0)$$,'42501',null,'operator cannot self-assign clinical access');
select is((select count(*)::int from public.user_invitations),0,'operator cannot enumerate team invitation emails');

select set_config('request.jwt.claims','{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select throws_ok($$select public.create_team_invitation('invited@example.invalid',true)$$,'22023',null,'active member cannot be invited again');
select throws_ok($$select public.revoke_team_invitation((select (result->>'id')::uuid from invitations where label='main'))$$,'22023',null,'consumed invitation is not confused with membership revocation');
select throws_ok($$select public.update_team_member(auth.uid(),1,false,false)$$,'22023',null,'owner cannot deactivate the last owner');
select throws_ok($$select public.update_team_member('d3333333-3333-4333-8333-333333333333',999,false,false)$$,'40001',null,'stale member edits are rejected');
select throws_ok($$select public.update_team_member('d3333333-3333-4333-8333-333333333333',null,true,true)$$,'40001',null,'null member version cannot bypass concurrency checks');
select throws_ok($$select public.update_team_member('d2222222-2222-4222-8222-222222222222',1,false,false)$$,'P0002',null,'cannot update another studio owner');
select lives_ok($$select public.set_client_assignment('daaaaaaa-1111-4111-8111-111111111111','d3333333-3333-4333-8333-333333333333',true,0)$$,'owner assigns a client');
select throws_ok($$select public.set_client_assignment('daaaaaaa-1111-4111-8111-111111111111','d3333333-3333-4333-8333-333333333333',false,0)$$,'40001',null,'assignment changes require current version');
select throws_ok($$select public.set_client_assignment('daaaaaaa-1111-4111-8111-111111111111','d3333333-3333-4333-8333-333333333333',true,null)$$,'40001',null,'null assignment version cannot bypass concurrency checks');
select throws_ok($$select public.set_client_assignment('dbbbbbbb-1111-4111-8111-111111111111','d3333333-3333-4333-8333-333333333333',true,0)$$,'22023',null,'assignment cannot cross tenant boundary');
select set_config('request.jwt.claims','{"sub":"d3333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select ok(public.can_access_client_clinical('daaaaaaa-1111-4111-8111-111111111111'),'assignment plus flag grants intended client access');
select ok(not public.can_access_client_clinical('daaaaaaa-2222-4222-8222-222222222222'),'other clients remain inaccessible clinically');

select set_config('request.jwt.claims','{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select lives_ok($$select public.update_team_member('d3333333-3333-4333-8333-333333333333',1,true,false)$$,'owner can revoke clinical flag');
select set_config('request.jwt.claims','{"sub":"d3333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select ok(not public.can_access_client_clinical('daaaaaaa-1111-4111-8111-111111111111'),'assignment alone cannot bypass clinical flag revocation');
select set_config('request.jwt.claims','{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select lives_ok($$select public.update_team_member('d3333333-3333-4333-8333-333333333333',2,false,true)$$,'owner suspends operator');
select is((select count(*)::int from public.client_assignments where active),0,'suspension revokes all assignments');
select set_config('request.jwt.claims','{"sub":"d3333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select is(public.membership_state(),'inactive','inactive account can obtain only its own state');
select is((select count(*)::int from public.clients),0,'suspended account loses ordinary contact access');
select throws_ok($$select public.bootstrap_workspace('New studio','New owner','Location','Service',60,0)$$,'42501',null,'suspension cannot be bypassed with onboarding');
select throws_ok($$select public.accept_team_invitation((select result->>'token' from invitations where label='main'),'Replay')$$,'22023',null,'old consumed token cannot reactivate suspended account');
select set_config('request.jwt.claims','{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select lives_ok($$select public.update_team_member('d3333333-3333-4333-8333-333333333333',3,true,true)$$,'owner can explicitly restore membership');
select is((select count(*)::int from public.client_assignments where active),0,'reactivation never restores revoked client assignments');

insert into invitations values ('revoked',public.create_team_invitation('other@example.invalid',false));
select lives_ok($$select public.revoke_team_invitation((select (result->>'id')::uuid from invitations where label='revoked'))$$,'owner revokes pending invitation');
select set_config('request.jwt.claims','{"sub":"d4444444-4444-4444-8444-444444444444","role":"authenticated"}',true);
select throws_ok($$select public.accept_team_invitation((select result->>'token' from invitations where label='revoked'),'Other')$$,'22023',null,'revoked invitation cannot be consumed');
select set_config('request.jwt.claims','{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
insert into invitations values ('expired',public.create_team_invitation('other@example.invalid',false));
reset role;
update public.user_invitations set created_at=now()-interval '5 days',expires_at=now()-interval '2 days' where id=(select (result->>'id')::uuid from invitations where label='expired');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d4444444-4444-4444-8444-444444444444","role":"authenticated"}',true);
select throws_ok($$select public.accept_team_invitation((select result->>'token' from invitations where label='expired'),'Other')$$,'22023',null,'expired invitation cannot be consumed');
select set_config('request.jwt.claims','{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
insert into invitations values ('old',public.create_team_invitation('other@example.invalid',false)),('replacement',public.create_team_invitation('other@example.invalid',false));
select is((select count(*)::int from public.user_invitations where email='other@example.invalid' and revoked_at is null and accepted_at is null),1,'reissue leaves only one pending invitation');
select set_config('request.jwt.claims','{"sub":"d4444444-4444-4444-8444-444444444444","role":"authenticated"}',true);
select throws_ok($$select public.accept_team_invitation((select result->>'token' from invitations where label='old'),'Other')$$,'22023',null,'reissue invalidates original token');

select set_config('request.jwt.claims','{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select lives_ok($$select public.create_appointment(gen_random_uuid(),jsonb_build_object('client_id','daaaaaaa-2222-4222-8222-222222222222','operator_id','d3333333-3333-4333-8333-333333333333','service_id','daaaaaaa-5555-4555-8555-555555555555','location_id','daaaaaaa-4444-4444-8444-444444444444','starts_at','2190-01-01T10:00:00Z','ends_at','2190-01-01T11:00:00Z','price_cents',0))$$,'owner booking creates assignment in same transaction');
select ok((select active from public.client_assignments where client_id='daaaaaaa-2222-4222-8222-222222222222'),'owner booking assigns client to operator');
select set_config('request.jwt.claims','{"sub":"d3333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select lives_ok($$select public.create_appointment(gen_random_uuid(),jsonb_build_object('client_id','daaaaaaa-3333-4333-8333-333333333333','operator_id',auth.uid(),'service_id','daaaaaaa-5555-4555-8555-555555555555','location_id','daaaaaaa-4444-4444-8444-444444444444','starts_at','2190-01-02T10:00:00Z','ends_at','2190-01-02T11:00:00Z','price_cents',0))$$,'operator may book ordinary appointment');
select ok(not public.can_access_client_clinical('daaaaaaa-3333-4333-8333-333333333333'),'self-booking never self-grants clinical access');

set local role anon;
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select public.membership_state()$$,'42501',null,'anonymous cannot inspect memberships');
select throws_ok($$select public.accept_team_invitation(repeat('a',64),'Anonymous')$$,'42501',null,'anonymous cannot redeem tokens');
select throws_ok($$select * from public.client_assignments$$,'42501',null,'anonymous cannot read assignments');
select * from finish();
rollback;
