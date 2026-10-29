begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create temporary table attempts(result jsonb);
grant all on attempts to service_role;
set local role service_role;
do $$declare result jsonb;begin
 for n in 1..350 loop
  result:=public.use_consent_packet(encode(extensions.digest('unknown-'||n,'sha256'),'hex'),'read');
 end loop;
 insert into attempts values(result);
end;$$;
select is((select result->>'status' from attempts),'410','rotating invalid packet tokens cannot consume a platform-wide quota');
reset role;
select ok(not has_function_privilege('anon','public.use_public_link(text,text,text,text,jsonb,uuid)','execute'),'anonymous RPC cannot forge the trusted source');
select ok(not has_function_privilege('authenticated','public.use_public_link(text,text,text,text,jsonb,uuid)','execute'),'professional RPC cannot forge the trusted source');
select ok(has_function_privilege('service_role','public.use_public_link(text,text,text,text,jsonb,uuid)','execute'),'gateway available only to trusted server');
select ok(not has_table_privilege('service_role','app_private.public_link_limits','select'),'quota rows have no direct service-role grant');
select ok(not has_function_privilege('authenticated','app_private.take_link_limit(text,text,integer)','execute'),'quota helper is private');
select is((select count(*)::int from app_private.public_link_limits where scope in('tenant','token')),0,'unknown tokens allocate no capability or tenant counters');
set local role service_role;
select throws_ok($$select public.use_public_link('raw-ip','packet',repeat('f',64),'read')$$,'22023','INVALID_LINK_SOURCE','source must be a server-produced digest');
select throws_ok($$select public.use_public_link(repeat('a',64),'foreign',repeat('f',64),'read')$$,'22023','INVALID_LINK_FAMILY','family is allowlisted');
do $$declare result jsonb;begin
 for n in 1..70 loop
  result:=public.use_public_link(repeat('a',64),'packet',encode(extensions.digest(n::text,'sha256'),'hex'),'read');
 end loop;
 insert into attempts values(result);
end;$$;
select is((select result->>'status' from attempts order by result->>'status' desc limit 1),'429','rotating tokens hit their origin limit');
select is(public.use_public_link(repeat('b',64),'packet',repeat('f',64),'read')->>'status','410','another origin is not blocked by invalid traffic');
select is(public.use_public_link(repeat('b',64),'signature',repeat('f',64),'read')->>'status','410','signature gateway preserves unavailable semantics');
select is(public.use_public_link(repeat('b',64),'intake',repeat('f',64),'read')->>'status','410','intake gateway preserves unavailable semantics');
select is(public.use_public_link(repeat('b',64),'appointment',repeat('f',64),'read')->>'status','410','appointment gateway preserves unavailable semantics');
reset role;
select is((select max(attempts) from app_private.public_link_limits where scope='invalid-source' and key_hash=repeat('a',64)),61,'rejected counters saturate without overflow');
select is((select count(*)::int from app_private.public_link_limits where scope='invalid-source' and key_hash=repeat('a',64)),1,'random unknown tokens share one origin row per window');
select is((select count(*)::int from app_private.signature_rate_limits where key='global'),0,'no shared admission row exists');
insert into app_private.public_link_limits
select 'source',encode(extensions.digest('expired-'||n,'sha256'),'hex'),date_trunc('minute',clock_timestamp())-interval '2 hours',1 from generate_series(1,5001) n;
do $$begin perform app_private.prune_reminder_logs();end;$$;
select is((select count(*)::int from app_private.public_link_limits where window_start<clock_timestamp()-interval '1 hour'),1,'hourly cleanup is bounded to 5000 quota rows');
do $$begin perform app_private.prune_reminder_logs();end;$$;
select is((select count(*)::int from app_private.public_link_limits where window_start<clock_timestamp()-interval '1 hour'),0,'next cleanup finishes the backlog');
select ok(exists(select 1 from app_private.public_link_limits where key_hash=repeat('b',64)),'cleanup preserves live origin windows');
select * from finish();
rollback;
