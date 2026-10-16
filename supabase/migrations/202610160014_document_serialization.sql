-- Fence PDF workers in the same tenant-first order as revocation and retry.
create unique index one_consent_per_preparation_revision on public.consents(appointment_id,preparation_version);

create or replace function public.claim_document_job(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare job app_private.document_jobs; doc public.consents; token uuid:=gen_random_uuid();
begin
 perform 1 from public.tenants t join public.consents d on d.tenant_id=t.id where d.id=p_id for update of t;
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

create or replace function public.complete_document_job(p_id uuid,p_claim uuid,p_sha256 text,p_size integer) returns void language plpgsql security definer set search_path='' as $$
declare job app_private.document_jobs; doc public.consents; path text;
begin
 perform 1 from public.tenants t join public.consents d on d.tenant_id=t.id where d.id=p_id for update of t;
 select * into job from app_private.document_jobs where consent_id=p_id for update;
 if not found or job.state<>'processing' or job.claim is distinct from p_claim or job.lease_until<=clock_timestamp() then raise exception 'STALE_CLAIM' using errcode='40001'; end if;
 select * into doc from public.consents where id=p_id;
 path:=doc.tenant_id::text||'/'||doc.id::text||'/glow-pdf-v1.pdf';
 if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_size is null or p_size not between 1 and 26214400 or not exists(select 1 from storage.objects where bucket_id='glow-documents' and name=path and (metadata->>'size')::bigint=p_size) then raise exception 'INVALID_DOCUMENT' using errcode='23514'; end if;
 update app_private.document_jobs set state='done',object_path=path,sha256=p_sha256,size_bytes=p_size,claim=null,lease_until=null where consent_id=p_id;
 update public.consents set document_state='ready' where id=p_id;
end;
$$;

create or replace function public.fail_document_job(p_id uuid,p_claim uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.tenants t join public.consents d on d.tenant_id=t.id where d.id=p_id for update of t;
 if p_reason is null or p_reason not in('render_failed','storage_failed','integrity_failed') then raise exception 'INVALID_DOCUMENT' using errcode='23514'; end if;
 update app_private.document_jobs set state='failed',failure_code=p_reason,claim=null,lease_until=null,next_attempt_at=clock_timestamp()+interval '30 seconds'
 where consent_id=p_id and state='processing' and claim=p_claim and lease_until>clock_timestamp();
 if found then update public.consents set document_state='failed' where id=p_id; end if;
end;
$$;

create or replace function public.use_signature_request(p_token_hash text,p_action text,p_input jsonb default null) returns jsonb
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
 if exists(select 1 from public.treatment_lots tl join public.pigment_lots l on l.id=tl.lot_id join public.pigments g on g.id=l.pigment_id
  where tl.preparation_id=p.id and (not l.active or not g.active or l.expires_on<greatest((clock_timestamp() at time zone (cap.snapshot->>'timezone'))::date,(a.starts_at at time zone (cap.snapshot->>'timezone'))::date)
  or (tl.snapshot->>'expires_on')::date<greatest((clock_timestamp() at time zone (cap.snapshot->>'timezone'))::date,(a.starts_at at time zone (cap.snapshot->>'timezone'))::date))) then return denied; end if;
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
