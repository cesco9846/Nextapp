-- Install capabilities only. Scheduling and secrets are an explicit operational step.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table app_private.reminder_invocations (
 id bigint primary key, kind text not null check(kind in('run','monitor')),
 queued_at timestamptz not null default clock_timestamp(),
 finished_at timestamptz, status_code integer
);
create index reminder_invocations_pending on app_private.reminder_invocations(kind) where finished_at is null;
alter table app_private.reminder_invocations enable row level security;
revoke all on app_private.reminder_invocations from public,anon,authenticated,service_role;

-- pg_net starts the request after commit; no database lock spans the HTTP call.
-- Only postgres/cron can enqueue to the fixed canonical endpoint using Vault.
-- The reusable key never enters the provider-managed pg_net queue.
create table app_private.reminder_nonces (
 nonce uuid primary key, consumed_at timestamptz not null default clock_timestamp()
);
alter table app_private.reminder_nonces enable row level security;
revoke all on app_private.reminder_nonces from public,anon,authenticated,service_role;
create function public.consume_reminder_invocation(p_nonce uuid,p_stamp bigint) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_nonce is null or p_stamp is null or abs(extract(epoch from clock_timestamp())-p_stamp)>90 then return false; end if;
 delete from app_private.reminder_nonces where consumed_at<clock_timestamp()-interval '10 minutes';
 insert into app_private.reminder_nonces(nonce) values(p_nonce) on conflict do nothing;
 return found;
end;
$$;
revoke all on function public.consume_reminder_invocation(uuid,bigint) from public,anon,authenticated;
grant execute on function public.consume_reminder_invocation(uuid,bigint) to service_role;

create or replace function app_private.enqueue_reminder_runner(p_kind text) returns bigint
language plpgsql security definer set search_path='' as $$
declare secret text; request_id bigint; nonce uuid:=gen_random_uuid(); stamp bigint:=floor(extract(epoch from clock_timestamp()))::bigint; signature text;
begin
 if p_kind is null or p_kind not in('run','monitor') then raise exception 'INVALID_RUNNER'; end if;
 perform pg_advisory_xact_lock(hashtextextended('glow:reminder:scheduler',0));
 update app_private.reminder_invocations i set finished_at=clock_timestamp(),status_code=coalesce(r.status_code,502)
 from net._http_response r where r.id=i.id and i.finished_at is null;
 update app_private.reminder_invocations set finished_at=clock_timestamp(),status_code=504
 where finished_at is null and queued_at<clock_timestamp()-interval '90 seconds';
 delete from app_private.reminder_invocations where queued_at<clock_timestamp()-interval '7 days';
 if exists(select 1 from app_private.reminder_invocations where kind=p_kind and finished_at is null) then return null; end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='glow_reminder_runner';
 if secret is null or length(secret)<32 then raise exception 'RUNNER_NOT_CONFIGURED'; end if;
 signature:=encode(extensions.hmac(p_kind||E'\n'||stamp::text||E'\n'||nonce::text,secret,'sha256'),'hex');
 select net.http_post(
  url:='https://glowlabs.it/api/internal/reminders/'||p_kind,
  headers:=jsonb_build_object('Content-Type','application/json','X-Glow-Time',stamp::text,'X-Glow-Nonce',nonce::text,'X-Glow-Signature',signature),
  body:='{}'::jsonb,timeout_milliseconds:=65000
 ) into request_id;
 insert into app_private.reminder_invocations(id,kind) values(request_id,p_kind);
 return request_id;
end;
$$;
revoke all on function app_private.enqueue_reminder_runner(text) from public,anon,authenticated,service_role;
