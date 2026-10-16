-- Signing is a separate capability from draft intake. Clinical payloads and
-- handwriting never have Data API grants. PDF work survives the HTTP response.
create table public.consent_requests (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 appointment_id uuid not null, preparation_id uuid not null,
 appointment_version integer not null, preparation_version integer not null,
 mode text not null check(mode in('link','tablet')), created_by uuid not null,
 request_id uuid not null, created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null, revoked_at timestamptz, used_at timestamptz,
 version integer not null default 1, unique(tenant_id,id), unique(created_by,request_id),
 check(expires_at>created_at),
 foreign key(tenant_id,preparation_id,appointment_id) references public.treatment_preparations(tenant_id,id,appointment_id),
 foreign key(tenant_id,created_by) references public.users(tenant_id,id)
);
create unique index one_open_signature on public.consent_requests(preparation_id,mode) where used_at is null and revoked_at is null;
create index signature_appointment on public.consent_requests(tenant_id,appointment_id,created_at desc);
alter table public.consent_requests enable row level security;
create policy signature_metadata on public.consent_requests for select to authenticated using(exists(
 select 1 from public.treatment_preparations p where p.id=preparation_id and public.can_access_client_clinical(p.client_id)));
revoke all on public.consent_requests from public,anon,authenticated;
grant select on public.consent_requests to authenticated;
create trigger audit_signature_request after insert or update on public.consent_requests for each row execute function app_private.audit_mutation();

create table public.consents (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 request_id uuid not null unique, appointment_id uuid not null, client_id uuid not null,
 preparation_version integer not null, signed_at timestamptz not null default clock_timestamp(),
 previous_id uuid, content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
 document_state text not null default 'pending' check(document_state in('pending','ready','failed')),
 renderer text not null default 'glow-pdf-v1' check(renderer='glow-pdf-v1'),
 unique(tenant_id,id),
 foreign key(tenant_id,request_id) references public.consent_requests(tenant_id,id),
 foreign key(tenant_id,appointment_id) references public.appointments(tenant_id,id),
 foreign key(tenant_id,client_id) references public.clients(tenant_id,id),
 foreign key(tenant_id,previous_id) references public.consents(tenant_id,id)
);
create index consent_appointment on public.consents(tenant_id,appointment_id,signed_at desc,id);
alter table public.consents enable row level security;
create policy consent_metadata on public.consents for select to authenticated using(public.can_access_client_clinical(client_id));
revoke all on public.consents from public,anon,authenticated;
grant select on public.consents to authenticated;
create trigger audit_consent after insert or update on public.consents for each row execute function app_private.audit_mutation();

create table app_private.signature_payloads (
 request_id uuid primary key references public.consent_requests(id), token_hash text not null unique,
 snapshot jsonb not null, snapshot_hash text not null,
 check(token_hash ~ '^[a-f0-9]{64}$'), check(snapshot_hash ~ '^[a-f0-9]{64}$')
);
create table app_private.signed_payloads (
 consent_id uuid primary key references public.consents(id), payload jsonb not null,
 submission_id uuid not null, submission_hash text not null check(submission_hash ~ '^[a-f0-9]{64}$')
);
create table app_private.document_jobs (
 consent_id uuid primary key references public.consents(id),
 state text not null default 'pending' check(state in('pending','processing','failed','done')),
 attempts integer not null default 0, claim uuid, lease_until timestamptz,
 next_attempt_at timestamptz not null default clock_timestamp(),
 failure_code text check(failure_code in('render_failed','storage_failed','integrity_failed')),
 object_path text, sha256 text, size_bytes integer,
 check(sha256 is null or sha256 ~ '^[a-f0-9]{64}$')
);
create table app_private.signature_rate_limits (
 key text not null, window_start timestamptz not null, attempts integer not null, primary key(key,window_start)
);
alter table app_private.signature_payloads enable row level security;
alter table app_private.signed_payloads enable row level security;
alter table app_private.document_jobs enable row level security;
alter table app_private.signature_rate_limits enable row level security;
revoke all on app_private.signature_payloads,app_private.signed_payloads,app_private.document_jobs,app_private.signature_rate_limits from public,anon,authenticated;

create function app_private.immutable_signed_payload() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'IMMUTABLE_DOCUMENT' using errcode='23514'; end;
$$;
create trigger immutable_signed_payload before update or delete on app_private.signed_payloads for each row execute function app_private.immutable_signed_payload();
create trigger immutable_signature_snapshot before update or delete on app_private.signature_payloads for each row execute function app_private.immutable_signed_payload();
create function app_private.guard_consent() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'IMMUTABLE_DOCUMENT' using errcode='23514'; end if;
 if (to_jsonb(new)-'document_state') is distinct from (to_jsonb(old)-'document_state') or old.document_state='ready' then
  raise exception 'IMMUTABLE_DOCUMENT' using errcode='23514';
 end if;
 return new;
end;
$$;
create trigger immutable_consent before update or delete on public.consents for each row execute function app_private.guard_consent();

create function public.create_signature_request(p_request_id uuid,p_appointment_id uuid,p_appointment_version integer,p_preparation_version integer,p_mode text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=app_private.current_tenant_id(); a public.appointments; p public.treatment_preparations; r public.consent_requests;
 c public.clients; t public.tenants; v public.clinical_template_versions; anam public.clinical_template_versions;
 answers jsonb; lots jsonb; snapshot jsonb; token text; q jsonb; today date; day date;
begin
 perform 1 from public.tenants where id=tenant for update;
 select * into a from public.appointments where id=p_appointment_id and tenant_id=tenant for update;
 if not found or not public.can_access_client_clinical(a.client_id) then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 if p_request_id is null or p_mode is null or p_mode not in('link','tablet') then raise exception 'INVALID_INTAKE' using errcode='22023'; end if;
 select * into r from public.consent_requests where created_by=auth.uid() and request_id=p_request_id;
 if found then
  if r.appointment_id<>a.id or r.appointment_version is distinct from p_appointment_version or r.preparation_version is distinct from p_preparation_version or r.mode<>p_mode then raise exception 'IDEMPOTENCY_MISMATCH' using errcode='23505'; end if;
  return jsonb_build_object('link',to_jsonb(r),'token',null);
 end if;
 select * into p from public.treatment_preparations where appointment_id=a.id for update;
 if not found then raise exception 'PREPARATION_REQUIRED' using errcode='22023'; end if;
 if a.version is distinct from p_appointment_version or p.version is distinct from p_preparation_version or p.appointment_version<>a.version then raise exception 'STALE_VERSION' using errcode='40001'; end if;
 select * into c from public.clients where id=a.client_id;
 if a.status not in('booked','confirmed') or a.ends_at<=clock_timestamp() or c.archived_at is not null then raise exception 'TERMINAL_APPOINTMENT' using errcode='22023'; end if;
 if exists(select 1 from public.consents where appointment_id=a.id and preparation_version=p.version) then raise exception 'ALREADY_SIGNED' using errcode='22023'; end if;
 select * into t from public.tenants where id=tenant;
 select * into v from public.clinical_template_versions where id=p.consent_version_id;
 select * into anam from public.clinical_template_versions where id=p.anamnesis_version_id;
 select x.answers into answers from app_private.preparation_answers x where x.preparation_id=p.id;
 answers:=coalesce(answers,'{}');
 if anam.id is not null then
  for q in select value from jsonb_array_elements(anam.questions) loop
   if (q->>'required')::boolean and (not(answers ? (q->>'id')) or (q->>'type'='text' and btrim(answers->>(q->>'id'))='')) then raise exception 'INCOMPLETE_ANSWERS' using errcode='22023'; end if;
  end loop;
 end if;
 today:=(clock_timestamp() at time zone t.timezone)::date; day:=(a.starts_at at time zone t.timezone)::date;
 if exists(select 1 from public.treatment_lots tl join public.pigment_lots l on l.id=tl.lot_id join public.pigments g on g.id=l.pigment_id
  where tl.preparation_id=p.id and (not l.active or not g.active or l.expires_on<greatest(today,day) or (tl.snapshot->>'expires_on')::date<greatest(today,day))) then raise exception 'LOT_UNAVAILABLE' using errcode='22023'; end if;
 select coalesce(jsonb_agg(tl.snapshot order by tl.id),'[]') into lots from public.treatment_lots tl where tl.preparation_id=p.id;
 snapshot:=jsonb_build_object('schema',1,'studio',t.name,'timezone',t.timezone,'client_name',c.first_name||' '||c.last_name,
 'service_name',a.service_name,'starts_at',a.starts_at,
 'consent',jsonb_build_object('id',v.id,'revision',v.revision,'title',v.title,'body',v.body,'content_hash',v.content_hash),
 'anamnesis',case when anam.id is null then null else jsonb_build_object('id',anam.id,'revision',anam.revision,'title',anam.title,'body',anam.body,'questions',anam.questions,'content_hash',anam.content_hash) end,
 'answers',answers,'lots',lots);
 if (select count(*) from public.consent_requests where tenant_id=tenant and created_at>clock_timestamp()-interval '1 hour')>=60 then raise exception 'RATE_LIMIT' using errcode='54000'; end if;
 update public.consent_requests set revoked_at=clock_timestamp(),version=version+1 where preparation_id=p.id and mode=p_mode and used_at is null and revoked_at is null;
 insert into public.consent_requests(tenant_id,appointment_id,preparation_id,appointment_version,preparation_version,created_by,request_id,mode,expires_at)
 values(tenant,a.id,p.id,a.version,p.version,auth.uid(),p_request_id,p_mode,least(a.ends_at,clock_timestamp()+case when p_mode='tablet' then interval '30 minutes' else interval '24 hours' end)) returning * into r;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into app_private.signature_payloads(request_id,token_hash,snapshot,snapshot_hash) values(r.id,encode(extensions.digest(token,'sha256'),'hex'),snapshot,encode(extensions.digest(snapshot::text,'sha256'),'hex'));
 return jsonb_build_object('link',to_jsonb(r),'token',token);
end;
$$;
create function public.revoke_signature_request(p_id uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare tenant uuid:=app_private.current_tenant_id(); r public.consent_requests;
begin
 perform 1 from public.tenants where id=tenant for update;
 select * into r from public.consent_requests where id=p_id and tenant_id=tenant for update;
 if not found or not exists(select 1 from public.treatment_preparations p where p.id=r.preparation_id and public.can_access_client_clinical(p.client_id)) then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 if r.version is distinct from p_version then raise exception 'STALE_VERSION' using errcode='40001'; end if;
 update public.consent_requests set revoked_at=clock_timestamp(),version=version+1 where id=r.id and revoked_at is null;
end;
$$;
revoke all on function public.create_signature_request(uuid,uuid,integer,integer,text),public.revoke_signature_request(uuid,integer) from public,anon;
grant execute on function public.create_signature_request(uuid,uuid,integer,integer,text),public.revoke_signature_request(uuid,integer) to authenticated;

-- Structural validation is duplicated at the privileged boundary: RPC callers
-- cannot bypass the HTTP schema. Coordinates only, no timing/pressure capture.
create function app_private.valid_handwriting(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare stroke jsonb; point jsonb; n integer:=0; minx numeric:=1; maxx numeric:=0; miny numeric:=1; maxy numeric:=0;
begin
 if p is null or jsonb_typeof(p)<>'array' or jsonb_array_length(p) not between 1 and 40 then return false; end if;
 for stroke in select value from jsonb_array_elements(p) loop
  if jsonb_typeof(stroke)<>'array' or jsonb_array_length(stroke) not between 2 and 500 then return false; end if;
  for point in select value from jsonb_array_elements(stroke) loop
   if jsonb_typeof(point)<>'array' or jsonb_array_length(point)<>2 or jsonb_typeof(point->0)<>'number' or jsonb_typeof(point->1)<>'number' then return false; end if;
   if (point->>0)::numeric not between 0 and 1 or (point->>1)::numeric not between 0 and 1 then return false; end if;
   minx:=least(minx,(point->>0)::numeric);maxx:=greatest(maxx,(point->>0)::numeric);miny:=least(miny,(point->>1)::numeric);maxy:=greatest(maxy,(point->>1)::numeric);n:=n+1;
  end loop;
 end loop;
 return n between 6 and 2000 and maxx-minx>=0.05 and maxy-miny>=0.02;
end;
$$;
create function public.use_signature_request(p_token_hash text,p_action text,p_input jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.consent_requests; a public.appointments; p public.treatment_preparations; c public.clients; issuer public.users;
 cap app_private.signature_payloads; signed app_private.signed_payloads; doc public.consents;
 attempts integer; minute timestamptz:=date_trunc('minute',clock_timestamp()); bodyhash text; payload jsonb; stamp timestamptz;
 denied constant jsonb:='{"ok":false,"status":410,"code":"SIGNATURE_UNAVAILABLE"}';
begin
 insert into app_private.signature_rate_limits values('global',minute,1) on conflict(key,window_start) do update set attempts=app_private.signature_rate_limits.attempts+1 returning signature_rate_limits.attempts into attempts;
 delete from app_private.signature_rate_limits where window_start<minute-interval '1 hour';
 if attempts>300 then return '{"ok":false,"status":429,"code":"RATE_LIMIT"}'; end if;
 if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then return denied; end if;
 insert into app_private.signature_rate_limits values(p_token_hash,minute,1) on conflict(key,window_start) do update set attempts=app_private.signature_rate_limits.attempts+1 returning signature_rate_limits.attempts into attempts;
 if attempts>30 then return '{"ok":false,"status":429,"code":"RATE_LIMIT"}'; end if;
 select * into cap from app_private.signature_payloads where token_hash=p_token_hash;
 if not found then return denied; end if;
 select * into r from public.consent_requests where id=cap.request_id;
 perform 1 from public.tenants where id=r.tenant_id for update;
 select * into a from public.appointments where id=r.appointment_id for update;
 select * into r from public.consent_requests where id=r.id for update;
 select * into p from public.treatment_preparations where id=r.preparation_id for update;
 select * into c from public.clients where id=p.client_id;
 select * into issuer from public.users where id=r.created_by;
 if r.revoked_at is not null or r.expires_at<=clock_timestamp() or c.archived_at is not null or not issuer.active
 or issuer.tenant_id<>r.tenant_id or (issuer.role<>'owner' and (not issuer.clinical_access or not exists(select 1 from public.client_assignments ca where ca.operator_id=issuer.id and ca.client_id=c.id and ca.active))) then return denied; end if;
 bodyhash:=encode(extensions.digest(p_input::text,'sha256'),'hex');
 if r.used_at is not null then
  select d.* into doc from public.consents d where d.request_id=r.id;
  select * into signed from app_private.signed_payloads where consent_id=doc.id;
  if p_action='sign' and signed.submission_hash=bodyhash then
   return jsonb_build_object('ok',true,'receipt',jsonb_build_object('id',doc.id,'signed_at',doc.signed_at));
  end if;
  return denied;
 end if;
 if a.status not in('booked','confirmed') or a.ends_at<=clock_timestamp() or a.version<>r.appointment_version or p.version<>r.preparation_version or p.appointment_version<>a.version then return denied; end if;
 -- A consumed parallel request cannot produce a second document for this revision.
 if exists(select 1 from public.consents where appointment_id=a.id and preparation_version=p.version) then return denied; end if;
 if p_action='read' then
  insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(r.tenant_id,null,'signature.read','consent_requests',r.id);
  return jsonb_build_object('ok',true,'context',jsonb_build_object('mode',r.mode,'expires_at',r.expires_at,'snapshot_hash',cap.snapshot_hash,'snapshot',cap.snapshot));
 elsif p_action='label' then
  if not exists(select 1 from jsonb_array_elements(cap.snapshot->'lots') v where v->>'label_file_id'=p_input->>'id') then return denied; end if;
  insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(r.tenant_id,null,'signature.label','consent_requests',r.id);
  return jsonb_build_object('ok',true,'file',(select jsonb_build_object('bucket',f.bucket,'path',f.object_path,'sha256',f.sha256,'mime',f.mime_type) from public.stored_files f where f.id=(p_input->>'id')::uuid and f.state='ready' and f.sha256=(select v->>'label_sha256' from jsonb_array_elements(cap.snapshot->'lots') v where v->>'label_file_id'=f.id::text limit 1)));
 elsif p_action<>'sign' or p_action is null then return denied;
 end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or p_input->>'snapshot_hash' is distinct from cap.snapshot_hash
 or p_input->'confirmed' is distinct from 'true'::jsonb or jsonb_typeof(p_input->'signer_name') is distinct from 'string'
 or char_length(btrim(p_input->>'signer_name')) not between 2 and 150
 or coalesce(p_input->>'request_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 or not app_private.valid_handwriting(p_input->'signature') then return '{"ok":false,"status":422,"code":"INVALID_SIGNATURE"}'; end if;
 stamp:=clock_timestamp();
 payload:=jsonb_build_object('snapshot',cap.snapshot,'snapshot_hash',cap.snapshot_hash,'signer_name',btrim(p_input->>'signer_name'),
 'signature',p_input->'signature','signed_at',stamp,'statement','Ho letto il consenso, verificato le risposte e le informazioni sui lotti e acconsento al trattamento.','signature_kind','drawn-v1');
 insert into public.consents(tenant_id,request_id,appointment_id,client_id,preparation_version,signed_at,previous_id,content_hash)
 values(r.tenant_id,r.id,a.id,c.id,p.version,stamp,(select id from public.consents where appointment_id=a.id order by signed_at desc,id desc limit 1),encode(extensions.digest(payload::text,'sha256'),'hex')) returning * into doc;
 insert into app_private.signed_payloads(consent_id,payload,submission_id,submission_hash) values(doc.id,payload,(p_input->>'request_id')::uuid,bodyhash);
 insert into app_private.document_jobs(consent_id) values(doc.id);
 update public.consent_requests set used_at=stamp,version=version+1 where id=r.id;
 update public.consent_requests set revoked_at=stamp,version=version+1 where preparation_id=p.id and id<>r.id and revoked_at is null and used_at is null;
 update public.intake_links set revoked_at=stamp,version=version+1 where preparation_id=p.id and used_at is null and revoked_at is null;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(r.tenant_id,null,'consent.signed','consents',doc.id);
 return jsonb_build_object('ok',true,'receipt',jsonb_build_object('id',doc.id,'signed_at',stamp));
end;
$$;
revoke all on function public.use_signature_request(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.use_signature_request(text,text,jsonb) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('glow-documents','glow-documents',false,26214400,array['application/pdf']);
-- No ordinary Storage policies exist for this bucket. All reads are audited.
create function public.claim_document_job(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare job app_private.document_jobs; doc public.consents; token uuid:=gen_random_uuid();
begin
 select * into job from app_private.document_jobs where consent_id=p_id for update skip locked;
 if not found or job.state='done' or (job.state='processing' and job.lease_until>clock_timestamp()) or job.next_attempt_at>clock_timestamp() then return null; end if;
 select * into doc from public.consents where id=p_id;
 update app_private.document_jobs set state='processing',claim=token,lease_until=clock_timestamp()+interval '2 minutes',attempts=attempts+1,failure_code=null where consent_id=p_id;
 update public.consents set document_state='pending' where id=p_id;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(doc.tenant_id,null,'document.render','consents',p_id);
 return jsonb_build_object('id',p_id,'claim',token,'renderer',doc.renderer,'content_hash',doc.content_hash,
 'path',doc.tenant_id::text||'/'||doc.id::text||'/glow-pdf-v1.pdf',
 'payload',(select payload from app_private.signed_payloads where consent_id=p_id),
 'labels',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'path',f.object_path,'sha256',v->>'label_sha256')),'[]')
  from app_private.signed_payloads sp cross join lateral jsonb_array_elements(sp.payload->'snapshot'->'lots') v
  join public.stored_files f on f.id=(v->>'label_file_id')::uuid and f.state='ready' and f.sha256=v->>'label_sha256' where sp.consent_id=p_id));
end;
$$;
create function public.complete_document_job(p_id uuid,p_claim uuid,p_sha256 text,p_size integer) returns void language plpgsql security definer set search_path='' as $$
declare job app_private.document_jobs; doc public.consents; path text;
begin
 select * into job from app_private.document_jobs where consent_id=p_id for update;
 if not found or job.state<>'processing' or job.claim is distinct from p_claim or job.lease_until<=clock_timestamp() then raise exception 'STALE_CLAIM' using errcode='40001'; end if;
 select * into doc from public.consents where id=p_id;
 path:=doc.tenant_id::text||'/'||doc.id::text||'/glow-pdf-v1.pdf';
 if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_size is null or p_size not between 1 and 26214400 or not exists(select 1 from storage.objects where bucket_id='glow-documents' and name=path and (metadata->>'size')::bigint=p_size) then raise exception 'INVALID_DOCUMENT' using errcode='23514'; end if;
 update app_private.document_jobs set state='done',object_path=path,sha256=p_sha256,size_bytes=p_size,claim=null,lease_until=null where consent_id=p_id;
 update public.consents set document_state='ready' where id=p_id;
end;
$$;
create function public.fail_document_job(p_id uuid,p_claim uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_reason is null or p_reason not in('render_failed','storage_failed','integrity_failed') then raise exception 'INVALID_DOCUMENT' using errcode='23514'; end if;
 update app_private.document_jobs set state='failed',failure_code=p_reason,claim=null,lease_until=null,next_attempt_at=clock_timestamp()+interval '30 seconds'
 where consent_id=p_id and state='processing' and claim=p_claim and lease_until>clock_timestamp();
 if found then update public.consents set document_state='failed' where id=p_id; end if;
end;
$$;
revoke all on function public.claim_document_job(uuid),public.complete_document_job(uuid,uuid,text,integer),public.fail_document_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_document_job(uuid),public.complete_document_job(uuid,uuid,text,integer),public.fail_document_job(uuid,uuid,text) to service_role;

create function public.request_document_retry(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare tenant uuid:=app_private.current_tenant_id(); doc public.consents;
begin
 perform 1 from public.tenants where id=tenant for update;
 select * into doc from public.consents where id=p_id and tenant_id=tenant;
 if not found or not public.can_access_client_clinical(doc.client_id) then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 if doc.document_state='ready' then return; end if;
 if (select count(*) from public.audit_log where actor_id=auth.uid() and action='document.retry' and created_at>clock_timestamp()-interval '1 minute')>=5 then raise exception 'RATE_LIMIT' using errcode='54000'; end if;
 update app_private.document_jobs set next_attempt_at=clock_timestamp() where consent_id=p_id and state<>'done';
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(tenant,auth.uid(),'document.retry','consents',p_id);
end;
$$;
create function public.read_consent_file(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=app_private.current_tenant_id(); doc public.consents; job app_private.document_jobs;
begin
 perform 1 from public.tenants where id=tenant for update;
 select * into doc from public.consents where id=p_id and tenant_id=tenant;
 if not found or not public.can_access_client_clinical(doc.client_id) then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 select * into job from app_private.document_jobs where consent_id=p_id and state='done';
 if doc.document_state<>'ready' or job.consent_id is null then raise exception 'DOCUMENT_PENDING' using errcode='22023'; end if;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(tenant,auth.uid(),'document.read','consents',p_id);
 return jsonb_build_object('path',job.object_path,'sha256',job.sha256,'size',job.size_bytes);
end;
$$;
revoke all on function public.request_document_retry(uuid),public.read_consent_file(uuid) from public,anon;
grant execute on function public.request_document_retry(uuid),public.read_consent_file(uuid) to authenticated;
revoke all on function app_private.valid_handwriting(jsonb),app_private.immutable_signed_payload(),app_private.guard_consent() from public,anon,authenticated;
