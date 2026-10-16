-- Separate, signed choices for photos. No grant is inferred from treatment consent.
alter table public.consents drop constraint consents_renderer_check;
alter table public.consents add constraint consents_renderer_check check(renderer in('glow-pdf-v1','glow-pdf-v2'));
create table public.photo_permissions (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 client_id uuid not null, appointment_id uuid not null, consent_id uuid not null,
 purpose text not null check(purpose in('documentation','demonstration')), allowed boolean not null,
 signed_at timestamptz not null, superseded_at timestamptz, revoked_at timestamptz, revoked_by uuid references public.users(id),
 version integer not null default 1,
 foreign key(tenant_id,client_id) references public.clients(tenant_id,id),
 foreign key(tenant_id,appointment_id) references public.appointments(tenant_id,id),
 foreign key(tenant_id,consent_id) references public.consents(tenant_id,id),
 check((revoked_at is null)=(revoked_by is null))
);
create unique index photo_permission_current on public.photo_permissions(appointment_id,purpose) where superseded_at is null;
create index photo_permission_client on public.photo_permissions(tenant_id,client_id,appointment_id);
alter table public.photo_permissions enable row level security;
create policy photo_permission_read on public.photo_permissions for select to authenticated using(public.can_access_client_clinical(client_id));
revoke all on public.photo_permissions from public,anon,authenticated;
grant select on public.photo_permissions to authenticated;
create trigger audit_photo_permission after insert or update on public.photo_permissions for each row execute function app_private.audit_mutation();

create table public.photos (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 client_id uuid not null, appointment_id uuid not null, file_id uuid not null unique,
 category text not null check(category in('before','after','healed')),
 state text not null default 'pending' check(state in('pending','ready')),
 created_at timestamptz not null default clock_timestamp(), created_by uuid not null references public.users(id),
 archived_at timestamptz, version integer not null default 1,
 foreign key(tenant_id,client_id) references public.clients(tenant_id,id),
 foreign key(tenant_id,appointment_id) references public.appointments(tenant_id,id),
 foreign key(tenant_id,file_id) references public.stored_files(tenant_id,id)
);
create index photos_gallery on public.photos(tenant_id,client_id,created_at desc,id);
alter table public.photos enable row level security;
create policy photo_metadata_read on public.photos for select to authenticated using(public.can_access_client_clinical(client_id));
revoke all on public.photos from public,anon,authenticated;
grant select on public.photos to authenticated;
create trigger audit_photo after insert or update on public.photos for each row execute function app_private.audit_mutation();

create function app_private.photo_documentation_allowed(p_appointment uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.photo_permissions where appointment_id=p_appointment and purpose='documentation' and allowed and revoked_at is null and superseded_at is null);
$$;
revoke all on function app_private.photo_documentation_allowed(uuid) from public,anon,authenticated;

create function public.prepare_photo(p_client_id uuid,p_appointment_id uuid,p_category text,p_request_id uuid,p_size integer,p_sha256 text,p_mime text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=app_private.current_tenant_id(); f public.stored_files; photo public.photos;
begin
 perform 1 from public.tenants where id=tenant for update;
 if not public.can_access_client_clinical(p_client_id) then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 if p_category is null or p_category not in('before','after','healed') or p_appointment_id is null
 or not exists(select 1 from public.appointments where id=p_appointment_id and client_id=p_client_id and tenant_id=tenant and status not in('cancelled','no_show')) then raise exception 'INVALID_PHOTO' using errcode='22023'; end if;
 if not app_private.photo_documentation_allowed(p_appointment_id) then raise exception 'PHOTO_PERMISSION_REQUIRED' using errcode='22023'; end if;
 f:=public.prepare_client_file(p_client_id,p_request_id,p_size,p_sha256,p_mime,p_appointment_id);
 select * into photo from public.photos where file_id=f.id;
 if found then
  if photo.category<>p_category then raise exception 'IDEMPOTENCY_MISMATCH' using errcode='23505'; end if;
 else
  insert into public.photos(tenant_id,client_id,appointment_id,file_id,category,created_by)
  values(tenant,p_client_id,p_appointment_id,f.id,p_category,auth.uid()) returning * into photo;
 end if;
 return jsonb_build_object('photo_id',photo.id,'id',f.id,'state',f.state,'bucket',f.bucket,'upload_path',f.upload_path,'expires_at',f.expires_at);
end;
$$;

create function public.complete_photo(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=app_private.current_tenant_id(); p public.photos; f public.stored_files;
begin
 perform 1 from public.tenants where id=tenant for update;
 select * into p from public.photos where id=p_id and tenant_id=tenant for update;
 if not found or not public.can_access_client_clinical(p.client_id) then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 if p.state='ready' then return to_jsonb(p); end if;
 if not app_private.photo_documentation_allowed(p.appointment_id) then raise exception 'PHOTO_PERMISSION_REQUIRED' using errcode='22023'; end if;
 if exists(select 1 from public.clients where id=p.client_id and archived_at is not null)
 or not exists(select 1 from public.appointments where id=p.appointment_id and client_id=p.client_id and status not in('cancelled','no_show')) then raise exception 'INVALID_PHOTO' using errcode='22023'; end if;
 select * into f from public.stored_files where id=p.file_id and client_id=p.client_id and appointment_id=p.appointment_id and state='ready';
 if not found then raise exception 'FILE_NOT_UPLOADED' using errcode='22023'; end if;
 update public.photos set state='ready',version=version+1 where id=p.id returning * into p;
 return to_jsonb(p);
end;
$$;

create function public.read_photo(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=app_private.current_tenant_id(); p public.photos; f public.stored_files;
begin
 perform 1 from public.tenants where id=tenant for update;
 select * into p from public.photos where id=p_id and tenant_id=tenant and state='ready' and archived_at is null;
 if not found or not public.can_access_client_clinical(p.client_id) then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 select * into f from public.stored_files where id=p.file_id and state='ready';
 if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(tenant,auth.uid(),'photo.read','photos',p.id);
 return jsonb_build_object('path',f.object_path,'sha256',f.sha256,'size',f.size_bytes,'mime',f.mime_type);
end;
$$;

create function public.revoke_photo_permission(p_id uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare tenant uuid:=app_private.current_tenant_id(); p public.photo_permissions;
begin
 perform 1 from public.tenants where id=tenant for update;
 select * into p from public.photo_permissions where id=p_id and tenant_id=tenant for update;
 if not found or not public.can_access_client_clinical(p.client_id) then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 if p.version is distinct from p_version or p.superseded_at is not null then raise exception 'STALE_VERSION' using errcode='40001'; end if;
 update public.photo_permissions set revoked_at=clock_timestamp(),revoked_by=auth.uid(),version=version+1 where id=p.id and revoked_at is null;
end;
$$;

create function public.archive_photo(p_id uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare tenant uuid:=app_private.current_tenant_id(); p public.photos;
begin
 perform 1 from public.tenants where id=tenant for update;
 select * into p from public.photos where id=p_id and tenant_id=tenant for update;
 if not found or not public.can_access_client_clinical(p.client_id) then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 if p.version is distinct from p_version then raise exception 'STALE_VERSION' using errcode='40001'; end if;
 update public.photos set archived_at=clock_timestamp(),version=version+1 where id=p.id and archived_at is null;
end;
$$;
revoke all on function public.prepare_photo(uuid,uuid,text,uuid,integer,text,text), public.complete_photo(uuid),public.read_photo(uuid),public.revoke_photo_permission(uuid,integer),public.archive_photo(uuid,integer) from public,anon;
grant execute on function public.prepare_photo(uuid,uuid,text,uuid,integer,text,text), public.complete_photo(uuid),public.read_photo(uuid),public.revoke_photo_permission(uuid,integer),public.archive_photo(uuid,integer) to authenticated;


create or replace function public.create_signature_request(p_request_id uuid,p_appointment_id uuid,p_appointment_version integer,p_preparation_version integer,p_mode text)
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
 'answers',answers,'lots',lots,
 'photo_policy',jsonb_build_object('version','glow-photo-v1',
 'documentation','Autorizzo le foto prima, dopo e guarito di questo trattamento per la documentazione riservata nel mio dossier, accessibile al personale autorizzato dello studio.',
 'demonstration','Autorizzo separatamente l’uso dimostrativo delle foto di questo trattamento nel portfolio e nei canali di comunicazione dello studio.',
 'notice','Entrambe le scelte sono facoltative. Il rifiuto non impedisce il trattamento. Puoi chiedere allo studio di revocare una scelta per gli usi futuri; la revoca non richiama copie già diffuse. Le immagini già raccolte nel dossier restano riservate secondo le regole di conservazione dello studio.'));

 if (select count(*) from public.consent_requests where tenant_id=tenant and created_at>clock_timestamp()-interval '1 hour')>=60 then raise exception 'RATE_LIMIT' using errcode='54000'; end if;
 update public.consent_requests set revoked_at=clock_timestamp(),version=version+1 where preparation_id=p.id and mode=p_mode and used_at is null and revoked_at is null;
 insert into public.consent_requests(tenant_id,appointment_id,preparation_id,appointment_version,preparation_version,created_by,request_id,mode,expires_at)
 values(tenant,a.id,p.id,a.version,p.version,auth.uid(),p_request_id,p_mode,least(a.ends_at,clock_timestamp()+case when p_mode='tablet' then interval '30 minutes' else interval '24 hours' end)) returning * into r;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into app_private.signature_payloads(request_id,token_hash,snapshot,snapshot_hash) values(r.id,encode(extensions.digest(token,'sha256'),'hex'),snapshot,encode(extensions.digest(snapshot::text,'sha256'),'hex'));
 return jsonb_build_object('link',to_jsonb(r),'token',token);
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
 if p_input ? 'photo_choices' and (
   cap.snapshot->'photo_policy'->>'version' is distinct from 'glow-photo-v1'
   or jsonb_typeof(p_input->'photo_choices') is distinct from 'object'
   or jsonb_typeof(p_input->'photo_choices'->'documentation') is distinct from 'boolean'
   or jsonb_typeof(p_input->'photo_choices'->'demonstration') is distinct from 'boolean'
   or (select count(*) from jsonb_object_keys(p_input->'photo_choices'))<>2
   or (p_input->'photo_choices'->>'demonstration'='true' and p_input->'photo_choices'->>'documentation'<>'true')
 ) then return '{"ok":false,"status":422,"code":"INVALID_SIGNATURE"}'; end if;
 stamp:=clock_timestamp();
 payload:=jsonb_build_object('snapshot',cap.snapshot,'snapshot_hash',cap.snapshot_hash,'signer_name',btrim(p_input->>'signer_name'),
 'signature',p_input->'signature','signed_at',stamp,'statement','Ho letto il consenso, verificato le risposte e le informazioni sui lotti e acconsento al trattamento.','signature_kind','drawn-v1');
 if p_input ? 'photo_choices' then payload:=payload||jsonb_build_object('photo_choices',p_input->'photo_choices'); end if;
 insert into public.consents(tenant_id,request_id,appointment_id,client_id,preparation_version,signed_at,previous_id,content_hash,renderer)
 values(r.tenant_id,r.id,a.id,c.id,p.version,stamp,(select id from public.consents where appointment_id=a.id order by signed_at desc,id desc limit 1),encode(extensions.digest(payload::text,'sha256'),'hex'),case when p_input ? 'photo_choices' then 'glow-pdf-v2' else 'glow-pdf-v1' end) returning * into doc;
 if p_input ? 'photo_choices' then
  update public.photo_permissions set superseded_at=stamp where appointment_id=a.id and superseded_at is null;
  insert into public.photo_permissions(tenant_id,client_id,appointment_id,purpose,allowed,consent_id,signed_at)
  select r.tenant_id,c.id,a.id,key,value::boolean,doc.id,stamp from jsonb_each_text(p_input->'photo_choices');
 end if;
 insert into app_private.signed_payloads(consent_id,payload,submission_id,submission_hash) values(doc.id,payload,(p_input->>'request_id')::uuid,bodyhash);
 insert into app_private.document_jobs(consent_id) values(doc.id);
 update public.consent_requests set used_at=stamp,version=version+1 where id=r.id;
 update public.consent_requests set revoked_at=stamp,version=version+1 where preparation_id=p.id and id<>r.id and revoked_at is null and used_at is null;
 update public.intake_links set revoked_at=stamp,version=version+1 where preparation_id=p.id and used_at is null and revoked_at is null;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(r.tenant_id,null,'consent.signed','consents',doc.id);
 return jsonb_build_object('ok',true,'receipt',jsonb_build_object('id',doc.id,'signed_at',stamp));
end;
$$;

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
 'path',doc.tenant_id::text||'/'||doc.id::text||'/'||doc.renderer||'.pdf',
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
 path:=doc.tenant_id::text||'/'||doc.id::text||'/'||doc.renderer||'.pdf';
 if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_size is null or p_size not between 1 and 26214400 or not exists(select 1 from storage.objects where bucket_id='glow-documents' and name=path and (metadata->>'size')::bigint=p_size) then raise exception 'INVALID_DOCUMENT' using errcode='23514'; end if;
 update app_private.document_jobs set state='done',object_path=path,sha256=p_sha256,size_bytes=p_size,claim=null,lease_until=null where consent_id=p_id;
 update public.consents set document_state='ready' where id=p_id;
end;
$$;
