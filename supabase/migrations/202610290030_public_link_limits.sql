-- Isolated counters. No raw IPs, unknown token rows, global admission row or
-- per-request pruning. Old capability contracts remain callable by service only.
create table app_private.public_link_limits(
 scope text not null check(scope in('source','invalid-source','token','tenant')),
 key_hash text not null check(key_hash ~ '^[a-f0-9]{64}$'),
 window_start timestamptz not null,attempts integer not null check(attempts>0),
 primary key(scope,key_hash,window_start)
);
create index public_link_limits_expiry on app_private.public_link_limits(window_start);
alter table app_private.public_link_limits enable row level security;
revoke all on app_private.public_link_limits from public,anon,authenticated,service_role;

create function app_private.take_link_limit(p_scope text,p_hash text,p_max integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;begin
 insert into app_private.public_link_limits values(p_scope,p_hash,date_trunc('minute',clock_timestamp()),1)
 on conflict(scope,key_hash,window_start) do update
 set attempts=least(app_private.public_link_limits.attempts+1,p_max+1) returning attempts into n;
 return n<=p_max;
end;$$;

create function app_private.public_link_tenant(p_family text,p_hash text) returns uuid
language sql stable security definer set search_path='' as $$
 select tenant_id from (
  select i.tenant_id from public.intake_links i join app_private.intake_capabilities c on c.link_id=i.id
   where p_family='intake' and c.token_hash=p_hash and i.revoked_at is null and i.expires_at>clock_timestamp()
  union all
  select r.tenant_id from public.consent_requests r join app_private.signature_payloads c on c.request_id=r.id
   where p_family='signature' and c.token_hash=p_hash and r.revoked_at is null and r.expires_at>clock_timestamp()
  union all
  select r.tenant_id from public.consent_requests r join app_private.consent_packet_parties p on p.packet_id=r.id
   where p_family='packet' and p.token_hash=p_hash and r.revoked_at is null and r.expires_at>clock_timestamp()
  union all
  select l.tenant_id from app_private.appointment_action_links l
   where p_family='appointment' and l.token_hash=p_hash and l.revoked_at is null and l.expires_at>clock_timestamp()
 ) x limit 1;
$$;

create function app_private.limit_link_capability(p_family text,p_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
declare tenant uuid;maximum integer:=case when p_family in('intake','appointment') then 20 else 30 end;begin
 tenant:=app_private.public_link_tenant(p_family,p_hash);
 -- Missing/expired/revoked tokens get the original unavailable response. They
 -- cannot allocate token counters or spend any tenant's quota.
 if tenant is null then return true;end if;
 if not app_private.take_link_limit('token',encode(extensions.digest(p_family||':'||p_hash,'sha256'),'hex'),maximum) then return false;end if;
 return app_private.take_link_limit('tenant',encode(extensions.digest(tenant::text,'sha256'),'hex'),1200);
end;$$;

-- Retain each function's permission, lock, snapshot and retry code verbatim.
-- Assert the narrow replacement against the applied function definitions.
do $$
declare item record;original text;changed text;begin
 for item in select * from (values
  ('public.use_intake_link(text,text,uuid,jsonb,boolean)','intake'),
  ('public.use_signature_request(text,text,jsonb)','signature'),
  ('public.use_consent_packet(text,text,jsonb)','packet'),
  ('public.use_appointment_action_link(text,text,uuid)','appointment')
 ) as f(signature,family) loop
  original:=pg_get_functiondef(item.signature::regprocedure);
  if original not like '%values(''global''%' then raise exception 'Unexpected legacy global counter: %',item.signature;end if;
  changed:=regexp_replace(original,'insert into app_private\.(intake_rate_limits|signature_rate_limits|appointment_response_limits)[^;]*values\(''global''[^;]*;','','g');
  changed:=regexp_replace(changed,'delete from app_private\.(intake_rate_limits|signature_rate_limits|appointment_response_limits) where window_start<[^;]*;','','g');
  changed:=regexp_replace(changed,'if attempts\s*>\s*300 then[^;]*;\s*end if;','','g');
  changed:=regexp_replace(changed,'insert into app_private\.(intake_rate_limits|signature_rate_limits|appointment_response_limits)[^;]*values\(p_token_hash[^;]*;\s*if attempts\s*>\s*(20|30) then[^;]*;\s*end if;',
   format('if not app_private.limit_link_capability(%L,p_token_hash) then return ''{"ok":false,"status":429,"code":"RATE_LIMIT"}''::jsonb;end if;',item.family),'g');
  if changed=original or changed like '%values(''global''%' or changed like '%values(p_token_hash%' or changed not like '%app_private.limit_link_capability(%'
   then raise exception 'Incomplete legacy counter replacement: %',item.signature;end if;
  execute changed;
 end loop;
end;$$;

create function public.use_public_link(p_source_hash text,p_family text,p_token_hash text,p_action text,p_input jsonb default null,p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;begin
 if p_source_hash is null or p_source_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_LINK_SOURCE' using errcode='22023';end if;
 if p_family is null or p_family not in('intake','signature','packet','appointment') then raise exception 'INVALID_LINK_FAMILY' using errcode='22023';end if;
 if not app_private.take_link_limit('source',p_source_hash,600) then return '{"ok":false,"status":429,"code":"RATE_LIMIT"}';end if;
 tenant:=app_private.public_link_tenant(p_family,p_token_hash);
 if tenant is null and not app_private.take_link_limit('invalid-source',p_source_hash,60) then return '{"ok":false,"status":429,"code":"RATE_LIMIT"}';end if;
 return case p_family
  when 'intake' then public.use_intake_link(p_token_hash,p_action,p_request_id,p_input->'answers',(p_input->>'confirm_read')::boolean)
  when 'signature' then public.use_signature_request(p_token_hash,p_action,p_input)
  when 'packet' then public.use_consent_packet(p_token_hash,p_action,p_input)
  when 'appointment' then public.use_appointment_action_link(p_token_hash,p_action,p_request_id) end;
end;$$;
revoke all on function public.use_public_link(text,text,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.use_public_link(text,text,text,text,jsonb,uuid) to service_role;
revoke all on function app_private.take_link_limit(text,text,integer),app_private.public_link_tenant(text,text),app_private.limit_link_capability(text,text) from public,anon,authenticated,service_role;

-- Reuse the existing hourly retention job, with bounded indexed batches.
alter function app_private.prune_reminder_logs() rename to prune_reminder_logs_before_link_limits;
revoke all on function app_private.prune_reminder_logs_before_link_limits() from public,anon,authenticated,service_role;
create function app_private.prune_reminder_logs() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;item text;n integer;removed integer:=0;begin
 result:=app_private.prune_reminder_logs_before_link_limits();
 foreach item in array array['public_link_limits','intake_rate_limits','signature_rate_limits','appointment_response_limits'] loop
  execute format('delete from app_private.%I where ctid in(select ctid from app_private.%I where window_start<clock_timestamp()-interval ''1 hour'' order by window_start limit 5000 for update skip locked)',item,item);
  get diagnostics n=row_count;removed:=removed+n;
 end loop;
 return result||jsonb_build_object('public_link_windows_removed',removed);
end;$$;
revoke all on function app_private.prune_reminder_logs() from public,anon,authenticated,service_role;
