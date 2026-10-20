-- Automatic recovery only. No reminder switch, clinical content or ready object is changed.
create table app_private.maintenance_settings(singleton boolean primary key default true check(singleton),enabled boolean not null default false);
insert into app_private.maintenance_settings values(true,false);
create table app_private.maintenance_runs(
 kind text primary key check(kind in('documents','cleanup')),run_id uuid,lease_until timestamptz,
 started_at timestamptz,finished_at timestamptz,last_success_at timestamptz,ok boolean,
 processed integer not null default 0,failed integer not null default 0
);
insert into app_private.maintenance_runs(kind) values('documents'),('cleanup');
create table app_private.maintenance_invocations(
 id bigint primary key,kind text not null check(kind in('documents','cleanup')),
 queued_at timestamptz not null default clock_timestamp(),finished_at timestamptz,status_code integer
);
create index maintenance_invocations_queued on app_private.maintenance_invocations(queued_at);
create table app_private.maintenance_alerts(
 kind text primary key check(kind in('document_worker_stale','file_cleanup_stale','pdf_backlog','pdf_attention','cleanup_backlog')),
 affected integer not null,first_seen_at timestamptz not null default clock_timestamp(),last_seen_at timestamptz not null default clock_timestamp(),resolved_at timestamptz
);
alter table app_private.maintenance_settings enable row level security;
alter table app_private.maintenance_runs enable row level security;
alter table app_private.maintenance_invocations enable row level security;
alter table app_private.maintenance_alerts enable row level security;
revoke all on app_private.maintenance_settings,app_private.maintenance_runs,app_private.maintenance_invocations,app_private.maintenance_alerts from public,anon,authenticated,service_role;
create index document_jobs_due on app_private.document_jobs(next_attempt_at,consent_id) where state<>'done';

create function public.start_maintenance_run(p_kind text,p_run uuid) returns text language plpgsql security definer set search_path='' as $$
declare r app_private.maintenance_runs;
begin
 if p_kind is null or p_kind not in('documents','cleanup') or p_run is null then raise exception 'INVALID_RUN' using errcode='22023'; end if;
 perform 1 from app_private.maintenance_settings where enabled for share;
 if not found then return 'disabled'; end if;
 select * into r from app_private.maintenance_runs where kind=p_kind for update;
 if r.lease_until>clock_timestamp() then return 'busy'; end if;
 update app_private.maintenance_runs set run_id=p_run,lease_until=clock_timestamp()+interval '2 minutes',started_at=clock_timestamp(),finished_at=null,ok=null,processed=0,failed=0 where kind=p_kind;
 return 'started';
end;$$;
create function public.finish_maintenance_run(p_kind text,p_run uuid,p_ok boolean,p_processed integer,p_failed integer) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_ok is null or p_processed is null or p_processed not between 0 and 10 or p_failed is null or p_failed not between 0 and 10 then raise exception 'INVALID_RUN' using errcode='22023'; end if;
 update app_private.maintenance_runs set finished_at=clock_timestamp(),lease_until=null,ok=p_ok,processed=p_processed,failed=p_failed,
 last_success_at=case when p_ok then clock_timestamp() else last_success_at end
 where kind=p_kind and run_id=p_run and lease_until>clock_timestamp();return found;
end;$$;
revoke all on function public.start_maintenance_run(text,uuid),public.finish_maintenance_run(text,uuid,boolean,integer,integer) from public,anon,authenticated;
grant execute on function public.start_maintenance_run(text,uuid),public.finish_maintenance_run(text,uuid,boolean,integer,integer) to service_role;

-- Tenant-first locks match the existing manual worker and signed artifact fencing.
-- Five total attempts cap automatic retries; integrity failures need intervention.
create function public.claim_next_document_job() returns jsonb language plpgsql security definer set search_path='' as $$
declare candidate record;job app_private.document_jobs;
begin
 for candidate in select consent_id from app_private.document_jobs where state<>'done' and attempts<5
  and failure_code is distinct from 'integrity_failed' and next_attempt_at<=clock_timestamp()
  and (state<>'processing' or lease_until<=clock_timestamp()) order by next_attempt_at,consent_id limit 20 loop
  perform 1 from public.tenants t join public.consents c on c.tenant_id=t.id where c.id=candidate.consent_id for update of t skip locked;
  if not found then continue; end if;
  select * into job from app_private.document_jobs where consent_id=candidate.consent_id for update skip locked;
  if found and job.state<>'done' and job.attempts<5 and job.failure_code is distinct from 'integrity_failed' and job.next_attempt_at<=clock_timestamp()
   and (job.state<>'processing' or job.lease_until<=clock_timestamp()) then
   return public.claim_document_job(job.consent_id);
  end if;
 end loop;return null;
end;$$;
revoke all on function public.claim_next_document_job() from public,anon,authenticated;
grant execute on function public.claim_next_document_job() to service_role;
create or replace function public.fail_document_job(p_id uuid,p_claim uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.tenants t join public.consents d on d.tenant_id=t.id where d.id=p_id for update of t;
 if p_reason is null or p_reason not in('render_failed','storage_failed','integrity_failed') then raise exception 'INVALID_DOCUMENT' using errcode='23514'; end if;
 update app_private.document_jobs set state='failed',failure_code=p_reason,claim=null,lease_until=null,
 next_attempt_at=clock_timestamp()+make_interval(secs=>30*power(2,least(greatest(attempts-1,0),7)))
 where consent_id=p_id and state='processing' and claim=p_claim and lease_until>clock_timestamp();
 if found then update public.consents set document_state='failed' where id=p_id; end if;
end;$$;

create function app_private.enqueue_maintenance_runner(p_kind text) returns bigint language plpgsql security definer set search_path='' as $$
declare secret text;request_id bigint;nonce uuid:=gen_random_uuid();stamp bigint:=floor(extract(epoch from clock_timestamp()))::bigint;
begin
 if p_kind is null or p_kind not in('documents','cleanup') then raise exception 'INVALID_RUNNER'; end if;
 if not exists(select 1 from app_private.maintenance_settings where enabled) then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('glow:maintenance:scheduler',0));
 update app_private.maintenance_invocations i set finished_at=clock_timestamp(),status_code=coalesce(r.status_code,502) from net._http_response r where i.id=r.id and i.finished_at is null;
 update app_private.maintenance_invocations set finished_at=clock_timestamp(),status_code=504 where finished_at is null and queued_at<clock_timestamp()-interval '90 seconds';
 if exists(select 1 from app_private.maintenance_invocations where kind=p_kind and finished_at is null) then return null; end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='glow_reminder_runner';
 if secret is null or length(secret)<32 then raise exception 'RUNNER_NOT_CONFIGURED'; end if;
 select net.http_post(url:='https://glowlabs.it/api/internal/maintenance/'||p_kind,headers:=jsonb_build_object('Content-Type','application/json','X-Glow-Time',stamp::text,'X-Glow-Nonce',nonce::text,
 'X-Glow-Signature',encode(extensions.hmac(p_kind||E'\n'||stamp::text||E'\n'||nonce::text,secret,'sha256'),'hex')),body:='{}'::jsonb,timeout_milliseconds:=65000) into request_id;
 insert into app_private.maintenance_invocations(id,kind) values(request_id,p_kind);return request_id;
end;$$;
revoke all on function app_private.enqueue_maintenance_runner(text) from public,anon,authenticated,service_role;

create function public.maintenance_worker_health(p_persist boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare enabled boolean;pdf_lag integer;attention integer;cleanup_lag integer;pending integer;warnings jsonb:='[]';item jsonb;
begin
 if p_persist then perform pg_advisory_xact_lock(hashtextextended('glow:maintenance:monitor',0)); end if;
 select s.enabled into enabled from app_private.maintenance_settings s;
 select count(*) filter(where state<>'done')::int,
 count(*) filter(where state<>'done' and (state<>'processing' or lease_until<clock_timestamp()) and (attempts>=5 or failure_code='integrity_failed'))::int,
 count(*) filter(where state<>'done' and attempts<5 and failure_code is distinct from 'integrity_failed' and next_attempt_at<clock_timestamp()-interval '5 minutes' and (state<>'processing' or lease_until<clock_timestamp()))::int
 into pending,attention,pdf_lag from app_private.document_jobs;
 select count(*)::int into cleanup_lag from public.stored_files f where (cleanup_lease_until is null or cleanup_lease_until<clock_timestamp()) and created_at<clock_timestamp()-interval '30 minutes'
 and ((state='ready' and staging_cleaned_at is null) or (state='failed' and cleanup_completed_at is null) or (state='pending' and expires_at<clock_timestamp())
 or (state='discarded' and (cleanup_completed_at is null or exists(select 1 from storage.objects o where o.bucket_id=f.bucket and o.name in(f.upload_path,f.object_path)))));
 if enabled then
  if exists(select 1 from app_private.maintenance_runs where kind='documents' and (last_success_at is null or last_success_at<clock_timestamp()-interval '5 minutes')) then warnings:=warnings||jsonb_build_array(jsonb_build_object('kind','document_worker_stale','affected',1)); end if;
  if exists(select 1 from app_private.maintenance_runs where kind='cleanup' and (last_success_at is null or last_success_at<clock_timestamp()-interval '30 minutes')) then warnings:=warnings||jsonb_build_array(jsonb_build_object('kind','file_cleanup_stale','affected',1)); end if;
  if pdf_lag>0 then warnings:=warnings||jsonb_build_array(jsonb_build_object('kind','pdf_backlog','affected',pdf_lag)); end if;
  if attention>0 then warnings:=warnings||jsonb_build_array(jsonb_build_object('kind','pdf_attention','affected',attention)); end if;
  if cleanup_lag>0 then warnings:=warnings||jsonb_build_array(jsonb_build_object('kind','cleanup_backlog','affected',cleanup_lag)); end if;
 end if;
 if p_persist then
  for item in select value from jsonb_array_elements(warnings) loop
   insert into app_private.maintenance_alerts(kind,affected) values(item->>'kind',(item->>'affected')::int)
   on conflict(kind) do update set affected=excluded.affected,last_seen_at=clock_timestamp(),resolved_at=null,
   first_seen_at=case when maintenance_alerts.resolved_at is null then maintenance_alerts.first_seen_at else clock_timestamp() end;
  end loop;
  update app_private.maintenance_alerts set resolved_at=clock_timestamp(),affected=0 where resolved_at is null and not exists(select 1 from jsonb_array_elements(warnings) x where x->>'kind'=maintenance_alerts.kind);
 end if;
 return jsonb_build_object('mode',case when enabled then 'enabled' else 'disabled' end,'status',case when jsonb_array_length(warnings)>0 then 'degraded' else 'ok' end,'warnings',warnings,
 'counts',jsonb_build_object('pdf_pending',pending,'pdf_attention',attention,'cleanup_lag',cleanup_lag),'workers',(select jsonb_agg(jsonb_build_object('kind',kind,'last_started_at',started_at,'last_success_at',last_success_at,'ok',ok,'processed',processed,'failed',failed) order by kind) from app_private.maintenance_runs));
end;$$;
revoke all on function public.maintenance_worker_health(boolean) from public,anon,authenticated;
grant execute on function public.maintenance_worker_health(boolean) to service_role;

-- Extend the established bounded retention; no per-poll heartbeat/history table.
alter function app_private.prune_reminder_logs() rename to prune_reminder_logs_before_maintenance;
revoke all on function app_private.prune_reminder_logs_before_maintenance() from public,anon,authenticated,service_role;
create function app_private.prune_reminder_logs() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;deleted integer;invocations integer;
begin
 result:=app_private.prune_reminder_logs_before_maintenance();
 if (result->>'skipped')::boolean then return result; end if;
 with expired as (
  select d.runid from cron.job_run_details d join cron.job j using(jobid)
  where j.jobname in('glow-document-worker','glow-file-cleanup','glow-maintenance-monitor') and d.end_time is not null
  and d.status not in('running','starting','connecting','sending') and
  ((d.status='succeeded' and d.end_time<clock_timestamp()-interval '7 days') or (d.status<>'succeeded' and d.end_time<clock_timestamp()-interval '30 days'))
  and d.runid<>(select max(x.runid) from cron.job_run_details x where x.jobid=d.jobid)
  order by d.end_time,d.runid limit 5000 for update of d skip locked
 ) delete from cron.job_run_details d using expired x where d.runid=x.runid;
 get diagnostics deleted=row_count;
 with expired as (
  select id from app_private.maintenance_invocations where finished_at is not null and queued_at<clock_timestamp()-interval '7 days' order by queued_at,id limit 5000 for update skip locked
 ) delete from app_private.maintenance_invocations i using expired x where i.id=x.id;
 get diagnostics invocations=row_count;
 return result||jsonb_build_object('cron_runs',(result->>'cron_runs')::int+deleted,'maintenance_invocations',invocations);
end;$$;
revoke all on function app_private.prune_reminder_logs() from public,anon,authenticated,service_role;
