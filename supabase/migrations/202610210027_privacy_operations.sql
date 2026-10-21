-- Privacy workflows never erase original clinical evidence. Only temporary
-- export copies are eligible for scheduled cleanup.
create table public.privacy_settings (
 tenant_id uuid primary key references public.tenants(id),
 version integer not null default 1 check(version>0),
 rules jsonb not null, notice text not null check(char_length(notice)<=12000),
 contact_email text not null check(char_length(contact_email)<=254),
 reviewed boolean not null default false, updated_at timestamptz not null default clock_timestamp(),
 updated_by uuid not null references public.users(id)
);
create table app_private.privacy_policy_versions (
 tenant_id uuid not null references public.tenants(id),version integer not null,
 settings jsonb not null,primary key(tenant_id,version)
);
create table public.privacy_requests (
 id uuid primary key,tenant_id uuid not null references public.tenants(id),client_id uuid not null,
 state text not null default 'received' check(state in('received','reviewing','retained','rejected','withdrawn')),
 identity_verified boolean not null default false,
 reason text check(reason in('retention_required','identity_unverified','request_withdrawn')),
 resolution_note text check(char_length(resolution_note)<=1000),policy_version integer,
 version integer not null default 1,created_by uuid not null references public.users(id),
 received_at timestamptz not null default clock_timestamp(),
 review_due_at timestamptz not null default clock_timestamp()+interval '1 month',
 updated_at timestamptz not null default clock_timestamp(),
 foreign key(tenant_id,client_id) references public.clients(tenant_id,id),
 check((state in('received','reviewing') and reason is null) or
       (state='retained' and reason='retention_required' and identity_verified and resolution_note is not null and char_length(btrim(resolution_note))>=10) or
       (state='rejected' and reason='identity_unverified') or
       (state='withdrawn' and reason='request_withdrawn'))
);
create unique index privacy_request_open on public.privacy_requests(client_id) where state in('received','reviewing');
create table public.privacy_exports (
 id uuid primary key,tenant_id uuid not null references public.tenants(id),client_id uuid not null,
 requested_by uuid not null references public.users(id),
 state text not null default 'building' check(state in('building','ready','failed','revoked')),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '24 hours',
 revoked_at timestamptz,
 size_bytes integer check(size_bytes between 1 and 62914560),
 sha256 text check(sha256 ~ '^[a-f0-9]{64}$'),
 failure_code text check(failure_code in('unavailable','limit_exceeded','integrity_failed')),
 foreign key(tenant_id,client_id) references public.clients(tenant_id,id),
 check(state<>'ready' or (size_bytes is not null and sha256 is not null))
);
create table app_private.privacy_export_payloads (
 export_id uuid primary key references public.privacy_exports(id) on delete cascade,
 payload jsonb, claim uuid,lease_until timestamptz,attempts integer not null default 0,
 cleanup_claim uuid,cleanup_lease_until timestamptz,cleaned_at timestamptz
);
create index privacy_exports_expiry on public.privacy_exports(expires_at,id);
alter table public.privacy_settings enable row level security;
alter table public.privacy_requests enable row level security;
alter table public.privacy_exports enable row level security;
alter table app_private.privacy_policy_versions enable row level security;
alter table app_private.privacy_export_payloads enable row level security;
revoke all on public.privacy_settings,public.privacy_requests,public.privacy_exports,
 app_private.privacy_policy_versions,app_private.privacy_export_payloads from public,anon,authenticated,service_role;
grant select on public.privacy_settings,public.privacy_requests,public.privacy_exports to authenticated;
create policy privacy_settings_read on public.privacy_settings for select to authenticated using(tenant_id=app_private.current_tenant_id() and app_private.is_owner());
create policy privacy_requests_read on public.privacy_requests for select to authenticated using(tenant_id=app_private.current_tenant_id() and app_private.is_owner());
create policy privacy_exports_read on public.privacy_exports for select to authenticated using(tenant_id=app_private.current_tenant_id() and app_private.is_owner());
create trigger audit_privacy_requests after insert or update on public.privacy_requests for each row execute function app_private.audit_mutation();
create trigger audit_privacy_exports after insert or update on public.privacy_exports for each row execute function app_private.audit_mutation();

create function app_private.privacy_owner(p_clinical boolean default false) returns public.users
language plpgsql security definer set search_path='' as $$
declare u public.users;tenant uuid:=app_private.current_tenant_id();
begin
 perform 1 from public.tenants where id=tenant for update;
 select * into u from public.users where id=auth.uid() and tenant_id=tenant and active and role='owner';
 if not found or (p_clinical and not u.clinical_access) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 return u;
end;$$;
revoke all on function app_private.privacy_owner(boolean) from public,anon,authenticated,service_role;

create function public.save_privacy_settings(p_version integer,p_rules jsonb,p_notice text,p_contact_email text,p_reviewed boolean)
returns public.privacy_settings language plpgsql security definer set search_path='' as $$
declare u public.users:=app_private.privacy_owner();s public.privacy_settings;category text;r jsonb;
begin
 if p_version is null or p_rules is null or jsonb_typeof(p_rules)<>'object' or
 (select count(*) from jsonb_object_keys(p_rules))<>3 or p_notice is null or char_length(p_notice)>12000 or
 p_contact_email is null or char_length(p_contact_email)>254 or
 (p_contact_email<>'' and p_contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or p_reviewed is null then
 raise exception 'INVALID_PRIVACY_SETTINGS' using errcode='22023';end if;
 foreach category in array array['contacts','clinical','audit'] loop
  r:=p_rules->category;
  if r is null or jsonb_typeof(r)<>'object' or (select count(*) from jsonb_object_keys(r))<>2 or
   not(r ?& array['months','basis']) or jsonb_typeof(r->'basis')<>'string' or char_length(r->>'basis')>1000 or
   (r->'months'<>'null'::jsonb and (jsonb_typeof(r->'months')<>'number' or (r->>'months') !~ '^[0-9]{1,3}$' or (r->>'months')::integer not between 1 and 600)) then
   raise exception 'INVALID_PRIVACY_SETTINGS' using errcode='22023';end if;
  if p_reviewed and (r->'months'='null'::jsonb or char_length(btrim(r->>'basis'))<10) then raise exception 'INVALID_PRIVACY_SETTINGS' using errcode='22023';end if;
 end loop;
 if p_reviewed and (char_length(btrim(p_notice))<50 or p_contact_email='') then raise exception 'INVALID_PRIVACY_SETTINGS' using errcode='22023';end if;
 select * into s from public.privacy_settings where tenant_id=u.tenant_id;
 if coalesce(s.version,0)<>p_version then raise exception 'STALE_VERSION' using errcode='40001';end if;
 insert into public.privacy_settings(tenant_id,version,rules,notice,contact_email,reviewed,updated_by)
 values(u.tenant_id,p_version+1,p_rules,p_notice,p_contact_email,p_reviewed,auth.uid())
 on conflict(tenant_id) do update set version=excluded.version,rules=excluded.rules,notice=excluded.notice,
 contact_email=excluded.contact_email,reviewed=excluded.reviewed,updated_by=excluded.updated_by,updated_at=clock_timestamp() returning * into s;
 insert into app_private.privacy_policy_versions values(s.tenant_id,s.version,to_jsonb(s));
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(u.tenant_id,auth.uid(),'privacy.settings','privacy_settings',u.tenant_id);
 return s;
end;$$;

create function public.create_privacy_request(p_id uuid,p_client_id uuid) returns public.privacy_requests
language plpgsql security definer set search_path='' as $$
declare u public.users:=app_private.privacy_owner();r public.privacy_requests;
begin
 if p_id is null then raise exception 'INVALID_PRIVACY_REQUEST' using errcode='22023';end if;
 select * into r from public.privacy_requests where id=p_id;
 if found then
  if r.tenant_id<>u.tenant_id or r.client_id<>p_client_id then raise exception 'IDEMPOTENCY_MISMATCH' using errcode='23505';end if;return r;
 end if;
 if not exists(select 1 from public.clients where id=p_client_id and tenant_id=u.tenant_id) then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if (select count(*) from public.privacy_requests where tenant_id=u.tenant_id and received_at>clock_timestamp()-interval '1 minute')>=10 then raise exception 'RATE_LIMIT' using errcode='54000';end if;
 insert into public.privacy_requests(id,tenant_id,client_id,created_by) values(p_id,u.tenant_id,p_client_id,auth.uid()) returning * into r;
 return r;
end;$$;
create function public.update_privacy_request(p_id uuid,p_version integer,p_state text,p_identity_verified boolean,p_note text default null)
returns public.privacy_requests language plpgsql security definer set search_path='' as $$
declare u public.users:=app_private.privacy_owner();r public.privacy_requests;resolution_reason text;
begin
 select * into r from public.privacy_requests where id=p_id and tenant_id=u.tenant_id for update;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if r.version is distinct from p_version then raise exception 'STALE_VERSION' using errcode='40001';end if;
 if r.state not in('received','reviewing') or p_state is null or p_state not in('reviewing','retained','rejected','withdrawn') or p_identity_verified is null or
 (r.identity_verified and not p_identity_verified) or (p_state='retained' and (not p_identity_verified or p_note is null or char_length(btrim(p_note))<10)) or char_length(p_note)>1000 or (p_state='rejected' and p_identity_verified) then
 raise exception 'INVALID_PRIVACY_REQUEST' using errcode='22023';end if;
 resolution_reason:=case p_state when 'retained' then 'retention_required' when 'rejected' then 'identity_unverified' when 'withdrawn' then 'request_withdrawn' end;
 update public.privacy_requests set state=p_state,identity_verified=p_identity_verified,reason=resolution_reason,
 resolution_note=case when p_state='retained' then btrim(p_note) end,
 policy_version=(select version from public.privacy_settings where tenant_id=u.tenant_id),version=version+1,updated_at=clock_timestamp() where id=p_id returning * into r;
 return r;
end;$$;

-- A single SQL statement snapshots related rows consistently. Capabilities,
-- provider secrets and other clients' content never enter the portable archive.
create function app_private.client_export_snapshot(p_client uuid) returns jsonb
language sql security definer set search_path='' as $$
with appointments as (select * from public.appointments where client_id=p_client),
 preps as (select * from public.treatment_preparations where client_id=p_client),
 docs as (select * from public.consents where client_id=p_client),
 lots as (select l.* from public.treatment_lots l join preps p on p.id=l.preparation_id),
 signed as (select s.* from app_private.signed_payloads s join docs d on d.id=s.consent_id),
 labels as (
  select (snapshot->>'label_file_id')::uuid id from lots where snapshot->>'label_file_id' is not null
  union select (v->>'label_file_id')::uuid from signed s cross join lateral jsonb_array_elements(s.payload->'snapshot'->'lots') v where v->>'label_file_id' is not null
 ),files as (
 select f.id,f.bucket,f.object_path path,f.sha256,f.size_bytes size,
 'allegati/'||f.id::text||case f.mime_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' else '.webp' end name
 from public.stored_files f where f.state='ready' and (f.client_id=p_client or f.id in(select id from labels))
 union all
 select d.id,'glow-documents',j.object_path,j.sha256,j.size_bytes,'consensi/'||d.id::text||'.pdf'
 from docs d join app_private.document_jobs j on j.consent_id=d.id where j.state='done'
 ),related_ids as (
 select p_client id union select id from appointments union select id from preps union select id from docs
 union select id from public.stored_files where client_id=p_client
 union select id from public.photos where client_id=p_client
 union select id from public.photo_permissions where client_id=p_client
 union select id from public.intake_links where appointment_id in(select id from appointments)
 union select id from public.consent_requests where appointment_id in(select id from appointments)
 union select id from public.privacy_requests where client_id=p_client
 union select id from public.privacy_exports where client_id=p_client
 )
select jsonb_build_object('schema','glow-client-export-v1','exported_at',clock_timestamp(),
 'client',(select to_jsonb(c)-'search_name' from public.clients c where c.id=p_client),
 'appointments',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('location_name',l.name,'operator_name',u.display_name) order by a.starts_at,a.id)
 from public.appointments a join public.locations l on l.id=a.location_id join public.users u on u.id=a.operator_id where a.client_id=p_client),'[]'),
 'preparations',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('answers',coalesce(a.answers,'{}')) order by p.id) from preps p left join app_private.preparation_answers a on a.preparation_id=p.id),'[]'),
 'templates',coalesce((select jsonb_agg(to_jsonb(v) order by v.id) from public.clinical_template_versions v where v.id in(select consent_version_id from preps union select anamnesis_version_id from preps)),'[]'),
 'treatment_lots',coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from lots l),'[]'),
 'consents',coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object('signed_payload',s.payload) order by d.id) from docs d join signed s on s.consent_id=d.id),'[]'),
 'photos',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.photos p where p.client_id=p_client),'[]'),
 'photo_permissions',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.photo_permissions p where p.client_id=p_client),'[]'),
 'privacy_requests',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.privacy_requests r where r.client_id=p_client),'[]'),
 'intake_links',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('submitted_at',r.submitted_at) order by l.id) from public.intake_links l left join app_private.intake_receipts r on r.link_id=l.id where l.appointment_id in(select id from appointments)),'[]'),
 'signature_requests',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.consent_requests r where r.appointment_id in(select id from appointments)),'[]'),
 'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'appointment_id',m.appointment_id,'kind',m.kind,'channel',m.channel,'scheduled_for',m.scheduled_for,'status',m.status,'updated_at',m.updated_at) order by m.id) from public.messages m where m.appointment_id in(select id from appointments)),'[]'),
 'appointment_responses',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'appointment_id',l.appointment_id,'action',r.action,'responded_at',r.responded_at) order by r.id) from app_private.appointment_responses r join app_private.appointment_action_links l on l.id=r.link_id where l.appointment_id in(select id from appointments)),'[]'),
 'audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.audit_log a where a.resource_id in(select id from related_ids)),'[]'),
 'files',coalesce((select jsonb_agg(to_jsonb(f) order by f.name) from files f),'[]'));
$$;
revoke all on function app_private.client_export_snapshot(uuid) from public,anon,authenticated,service_role;

create function public.prepare_privacy_export(p_id uuid,p_client_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.users:=app_private.privacy_owner(true);e public.privacy_exports;j app_private.privacy_export_payloads;snapshot jsonb;token uuid:=gen_random_uuid();
begin
 if p_id is null then raise exception 'INVALID_PRIVACY_REQUEST' using errcode='22023';end if;
 select * into e from public.privacy_exports where id=p_id;
 if found then
  if e.tenant_id<>u.tenant_id or e.client_id<>p_client_id then raise exception 'IDEMPOTENCY_MISMATCH' using errcode='23505';end if;
  if e.expires_at<=clock_timestamp() or e.state='revoked' then raise exception 'EXPORT_EXPIRED' using errcode='22023';end if;
  if e.state='ready' then return jsonb_build_object('export',to_jsonb(e));end if;
  select * into j from app_private.privacy_export_payloads where export_id=e.id for update;
  if j.lease_until>clock_timestamp() then raise exception 'EXPORT_BUSY' using errcode='40001';end if;
  if j.attempts>=3 then raise exception 'EXPORT_RETRY_LIMIT' using errcode='22023';end if;
 else
  if not exists(select 1 from public.clients where id=p_client_id and tenant_id=u.tenant_id) then raise exception 'NOT_FOUND' using errcode='P0002';end if;
  if (select count(*) from public.privacy_exports where tenant_id=u.tenant_id and created_at>clock_timestamp()-interval '1 minute')>=2 or
   (select count(*) from public.privacy_exports where tenant_id=u.tenant_id and state<>'revoked' and expires_at>clock_timestamp())>=3 then raise exception 'RATE_LIMIT' using errcode='54000';end if;
  snapshot:=app_private.client_export_snapshot(p_client_id);
  if octet_length(snapshot::text)>2097152 or jsonb_array_length(snapshot->'files')>200 or
   (select coalesce(sum((x->>'size')::bigint),0) from jsonb_array_elements(snapshot->'files') x)>52428800 then raise exception 'EXPORT_LIMIT' using errcode='22023';end if;
  insert into public.privacy_exports(id,tenant_id,client_id,requested_by) values(p_id,u.tenant_id,p_client_id,auth.uid()) returning * into e;
  insert into app_private.privacy_export_payloads(export_id,payload) values(e.id,snapshot);
 end if;
 update app_private.privacy_export_payloads set claim=token,lease_until=clock_timestamp()+interval '2 minutes',attempts=attempts+1 where export_id=e.id returning * into j;
 update public.privacy_exports set state='building',failure_code=null where id=e.id returning * into e;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(u.tenant_id,auth.uid(),'privacy.export_snapshot','clients',e.client_id);
 return jsonb_build_object('export',to_jsonb(e),'claim',token,'snapshot',j.payload,'path',e.tenant_id::text||'/'||e.id::text||'/archive.zip');
end;$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('glow-exports','glow-exports',false,62914560,array['application/zip']);
-- No authenticated Storage policy exists: every download passes a new RPC check.
create function public.finish_privacy_export(p_id uuid,p_claim uuid,p_sha256 text,p_size integer,p_failure text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare e public.privacy_exports;j app_private.privacy_export_payloads;
begin
 perform 1 from public.tenants t join public.privacy_exports x on x.tenant_id=t.id where x.id=p_id for update of t;
 select * into e from public.privacy_exports where id=p_id for update;
 select * into j from app_private.privacy_export_payloads where export_id=p_id for update;
 if e.id is null or e.state<>'building' or e.expires_at<=clock_timestamp() or j.claim is distinct from p_claim or j.lease_until<=clock_timestamp() then return false;end if;
 if p_failure is not null then
  if p_failure not in('unavailable','limit_exceeded','integrity_failed') then raise exception 'INVALID_EXPORT' using errcode='22023';end if;
  update public.privacy_exports set state='failed',failure_code=p_failure where id=p_id;
 else
  if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_size is null or p_size not between 1 and 62914560 or
   not exists(select 1 from storage.objects where bucket_id='glow-exports' and name=e.tenant_id::text||'/'||e.id::text||'/archive.zip' and (metadata->>'size')::bigint=p_size) then raise exception 'INVALID_EXPORT' using errcode='23514';end if;
  update public.privacy_exports set state='ready',size_bytes=p_size,sha256=p_sha256,failure_code=null where id=p_id;
 end if;
 update app_private.privacy_export_payloads set claim=null,lease_until=null where export_id=p_id;return true;
end;$$;
create function public.access_privacy_export(p_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.users:=app_private.privacy_owner(true);e public.privacy_exports;
begin
 select * into e from public.privacy_exports where id=p_id and tenant_id=u.tenant_id for update;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if p_action='revoke' then
  if e.state<>'revoked' then update public.privacy_exports set state='revoked',revoked_at=clock_timestamp() where id=p_id;end if;
  update app_private.privacy_export_payloads set payload=null where export_id=p_id;
  return jsonb_build_object('revoked',true);
 end if;
 if p_action is distinct from 'read' then raise exception 'INVALID_EXPORT' using errcode='22023';end if;
 if e.expires_at<=clock_timestamp() or e.state='revoked' then raise exception 'EXPORT_EXPIRED' using errcode='22023';end if;
 if e.state<>'ready' then raise exception 'EXPORT_NOT_READY' using errcode='22023';end if;
 if (select count(*) from public.audit_log where tenant_id=u.tenant_id and actor_id=auth.uid() and action='privacy.export_read' and created_at>clock_timestamp()-interval '1 minute')>=10 then raise exception 'RATE_LIMIT' using errcode='54000';end if;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(u.tenant_id,auth.uid(),'privacy.export_read','privacy_exports',p_id);
 return jsonb_build_object('path',e.tenant_id::text||'/'||e.id::text||'/archive.zip','sha256',e.sha256,'size',e.size_bytes);
end;$$;

create function public.claim_privacy_export_cleanup(p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_limit is null or p_limit not between 1 and 10 then raise exception 'INVALID_LIMIT' using errcode='22023';end if;
 with eligible as (
  select j.export_id from app_private.privacy_export_payloads j join public.privacy_exports e on e.id=j.export_id
  where (e.expires_at<=clock_timestamp() or e.state='revoked')
   and (j.cleanup_lease_until is null or j.cleanup_lease_until<=clock_timestamp())
   and (j.cleaned_at is null or exists(select 1 from storage.objects o where o.bucket_id='glow-exports' and o.name=e.tenant_id::text||'/'||e.id::text||'/archive.zip'))
  order by e.expires_at,e.id limit p_limit for update of j skip locked
 ), claimed as (
  update app_private.privacy_export_payloads j set payload=null,claim=null,lease_until=null,
   cleanup_claim=gen_random_uuid(),cleanup_lease_until=clock_timestamp()+interval '2 minutes'
  from eligible x where j.export_id=x.export_id returning j.export_id,j.cleanup_claim
 ) select coalesce(jsonb_agg(jsonb_build_object('id',c.export_id,'claim',c.cleanup_claim,'path',e.tenant_id::text||'/'||e.id::text||'/archive.zip')),'[]') into result
 from claimed c join public.privacy_exports e on e.id=c.export_id;
 return result;
end;$$;
create function public.complete_privacy_export_cleanup(p_id uuid,p_claim uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update app_private.privacy_export_payloads j set cleaned_at=clock_timestamp(),cleanup_claim=null,cleanup_lease_until=null
 from public.privacy_exports e where j.export_id=e.id and e.id=p_id and j.cleanup_claim=p_claim and j.cleanup_lease_until>clock_timestamp()
 and not exists(select 1 from storage.objects o where o.bucket_id='glow-exports' and o.name=e.tenant_id::text||'/'||e.id::text||'/archive.zip');
 return found;
end;$$;
revoke all on function public.save_privacy_settings(integer,jsonb,text,text,boolean),public.create_privacy_request(uuid,uuid),public.update_privacy_request(uuid,integer,text,boolean,text),public.prepare_privacy_export(uuid,uuid),public.access_privacy_export(uuid,text) from public,anon;
grant execute on function public.save_privacy_settings(integer,jsonb,text,text,boolean),public.create_privacy_request(uuid,uuid),public.update_privacy_request(uuid,integer,text,boolean,text),public.prepare_privacy_export(uuid,uuid),public.access_privacy_export(uuid,text) to authenticated;
revoke all on function public.finish_privacy_export(uuid,uuid,text,integer,text),public.claim_privacy_export_cleanup(integer),public.complete_privacy_export_cleanup(uuid,uuid) from public,anon,authenticated;
grant execute on function public.finish_privacy_export(uuid,uuid,text,integer,text),public.claim_privacy_export_cleanup(integer),public.complete_privacy_export_cleanup(uuid,uuid) to service_role;

-- Existing monitor and five bounded alert rows cover temporary export cleanup
-- as well. No new polling history, notification channel or cron is introduced.
alter function public.maintenance_worker_health(boolean) rename to maintenance_worker_health_before_privacy;
revoke all on function public.maintenance_worker_health_before_privacy(boolean) from public,anon,authenticated,service_role;
create function public.maintenance_worker_health(p_persist boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;lag integer;warnings jsonb;item jsonb;cleanup integer;
begin
 if p_persist then perform pg_advisory_xact_lock(hashtextextended('glow:maintenance:monitor',0));end if;
 result:=public.maintenance_worker_health_before_privacy(false);
 select count(*)::int into lag from public.privacy_exports e join app_private.privacy_export_payloads j on j.export_id=e.id
 where coalesce(e.revoked_at,e.expires_at)<clock_timestamp()-interval '30 minutes'
 and (j.cleaned_at is null or exists(select 1 from storage.objects o where o.bucket_id='glow-exports' and o.name=e.tenant_id::text||'/'||e.id::text||'/archive.zip'));
 warnings:=result->'warnings';
 if result->>'mode'='enabled' and lag>0 then
  select coalesce((x->>'affected')::integer,0) into cleanup from jsonb_array_elements(warnings) x where x->>'kind'='cleanup_backlog';
  select coalesce(jsonb_agg(x),'[]') into warnings from jsonb_array_elements(warnings) x where x->>'kind'<>'cleanup_backlog';
  warnings:=warnings||jsonb_build_array(jsonb_build_object('kind','cleanup_backlog','affected',coalesce(cleanup,0)+lag));
 end if;
 if p_persist then
  for item in select value from jsonb_array_elements(warnings) loop
   insert into app_private.maintenance_alerts(kind,affected) values(item->>'kind',(item->>'affected')::integer)
   on conflict(kind) do update set affected=excluded.affected,last_seen_at=clock_timestamp(),resolved_at=null,
    first_seen_at=case when maintenance_alerts.resolved_at is null then maintenance_alerts.first_seen_at else clock_timestamp() end;
  end loop;
  update app_private.maintenance_alerts a set resolved_at=clock_timestamp(),affected=0 where a.resolved_at is null and not exists(select 1 from jsonb_array_elements(warnings) x where x->>'kind'=a.kind);
 end if;
 return result||jsonb_build_object('status',case when jsonb_array_length(warnings)>0 then 'degraded' else 'ok' end,'warnings',warnings,'counts',(result->'counts')||jsonb_build_object('export_cleanup_lag',lag));
end;$$;
revoke all on function public.maintenance_worker_health(boolean) from public,anon,authenticated;
grant execute on function public.maintenance_worker_health(boolean) to service_role;

-- Keep temporary snapshots bounded even if file deletion is retrying. Preserve
-- request history and audit; remove only cleaned export metadata after 30 days.
alter function app_private.prune_reminder_logs() rename to prune_reminder_logs_before_privacy;
revoke all on function app_private.prune_reminder_logs_before_privacy() from public,anon,authenticated,service_role;
create function app_private.prune_reminder_logs() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; snapshots integer;exports integer;
begin
 result:=app_private.prune_reminder_logs_before_privacy();
 if (result->>'skipped')::boolean then return result;end if;
 with expired as (select j.export_id from app_private.privacy_export_payloads j join public.privacy_exports e on e.id=j.export_id
  where j.payload is not null and (e.expires_at<=clock_timestamp() or e.state='revoked') order by e.expires_at limit 1000 for update of j skip locked)
 update app_private.privacy_export_payloads j set payload=null from expired x where j.export_id=x.export_id;
 get diagnostics snapshots=row_count;
 with expired as (select e.id from public.privacy_exports e join app_private.privacy_export_payloads j on j.export_id=e.id
  where e.expires_at<clock_timestamp()-interval '30 days' and j.cleaned_at is not null
  and not exists(select 1 from storage.objects o where o.bucket_id='glow-exports' and o.name=e.tenant_id::text||'/'||e.id::text||'/archive.zip')
  order by e.expires_at limit 1000 for update of e skip locked)
 delete from public.privacy_exports e using expired x where e.id=x.id;
 get diagnostics exports=row_count;
 return result||jsonb_build_object('export_snapshots',snapshots,'export_metadata',exports);
end;$$;
revoke all on function app_private.prune_reminder_logs() from public,anon,authenticated,service_role;

-- Only the notice the owner explicitly marks reviewed/published is public.
-- Neither retention details nor client records can be enumerated here.
create function public.read_privacy_notice(p_tenant_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('studio',t.name,'notice',s.notice,'contact_email',s.contact_email,'version',s.version,'updated_at',s.updated_at)
 from public.privacy_settings s join public.tenants t on t.id=s.tenant_id where s.tenant_id=p_tenant_id and s.reviewed;
$$;
revoke all on function public.read_privacy_notice(uuid) from public;
grant execute on function public.read_privacy_notice(uuid) to anon,authenticated;
