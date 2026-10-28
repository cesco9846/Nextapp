-- Optional native PMU packages. All personal evidence remains private; legacy
-- document versions, payloads and renderer paths are preserved byte for byte.
create table app_private.document_profiles(
 tenant_id uuid primary key references public.tenants(id),version integer not null,details jsonb not null
);
create table app_private.consent_packages(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 service_id uuid not null,origin text not null,source_revision integer not null,version integer not null default 1,
 content jsonb not null,published_version_id uuid,published_revision integer not null default 0,
 unique(tenant_id,id),unique(tenant_id,service_id,origin),
 foreign key(tenant_id,service_id) references public.services(tenant_id,id)
);
create table app_private.consent_package_versions(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,package_id uuid not null,revision integer not null,
 content jsonb not null,professional jsonb not null,consent_version_id uuid not null,anamnesis_version_id uuid not null,
 content_hash text not null,published_by uuid not null references public.users(id),published_at timestamptz not null default clock_timestamp(),
 unique(tenant_id,id),unique(package_id,revision),
 foreign key(tenant_id,package_id) references app_private.consent_packages(tenant_id,id),
 foreign key(tenant_id,consent_version_id) references public.clinical_template_versions(tenant_id,id),
 foreign key(tenant_id,anamnesis_version_id) references public.clinical_template_versions(tenant_id,id)
);
alter table app_private.consent_packages add foreign key(tenant_id,published_version_id) references app_private.consent_package_versions(tenant_id,id);
alter table public.clinical_templates add column package_id uuid;
alter table public.clinical_templates add foreign key(tenant_id,package_id) references app_private.consent_packages(tenant_id,id);
create table app_private.consent_packets(
 id uuid primary key references public.consent_requests(id),tenant_id uuid not null,client_id uuid not null,
 package_version_id uuid not null,details jsonb not null,client_version integer not null,version integer not null default 1,
 issue_hash text not null,snapshot jsonb,snapshot_hash text,document_id uuid,created_at timestamptz not null default clock_timestamp(),
 unique(tenant_id,id),foreign key(tenant_id,client_id) references public.clients(tenant_id,id),
 foreign key(tenant_id,package_version_id) references app_private.consent_package_versions(tenant_id,id),
 foreign key(tenant_id,document_id) references public.consents(tenant_id,id)
);
create table app_private.consent_packet_parties(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,packet_id uuid not null,ordinal integer not null,
 identity jsonb not null,token_hash text not null unique,health jsonb,signature jsonb,submission_hash text,
 unique(packet_id,ordinal),foreign key(tenant_id,packet_id) references app_private.consent_packets(tenant_id,id)
);
create table app_private.consent_packet_countersignatures(
 packet_id uuid primary key references app_private.consent_packets(id),receipt jsonb not null,submission_hash text not null
);
do $$ declare t text;begin
 foreach t in array array['document_profiles','consent_packages','consent_package_versions','consent_packets','consent_packet_parties','consent_packet_countersignatures'] loop
  execute format('alter table app_private.%I enable row level security',t);
  execute format('revoke all on app_private.%I from public,anon,authenticated,service_role',t);
 end loop;
end;$$;
create trigger immutable_package_version before update or delete on app_private.consent_package_versions for each row execute function app_private.immutable_signed_payload();
create trigger immutable_packet_counter before update or delete on app_private.consent_packet_countersignatures for each row execute function app_private.immutable_signed_payload();
create function app_private.guard_packet_evidence() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or (old.health is not null and new.health is distinct from old.health)
 or (old.signature is not null and (new.signature is distinct from old.signature or new.submission_hash is distinct from old.submission_hash))
 or new.identity is distinct from old.identity or new.packet_id<>old.packet_id or new.tenant_id<>old.tenant_id or new.ordinal<>old.ordinal then raise exception 'IMMUTABLE_DOCUMENT' using errcode='23514';end if;
 return new;
end;$$;
create trigger immutable_packet_evidence before update or delete on app_private.consent_packet_parties for each row execute function app_private.guard_packet_evidence();
create function app_private.guard_packet_snapshot() returns trigger language plpgsql set search_path='' as $$
begin
 if new.details is distinct from old.details or new.client_version<>old.client_version or new.client_id<>old.client_id or new.tenant_id<>old.tenant_id or new.package_version_id<>old.package_version_id or new.issue_hash<>old.issue_hash or (old.document_id is not null and new.document_id is distinct from old.document_id) or (old.snapshot is not null and (new.snapshot is distinct from old.snapshot or new.snapshot_hash is distinct from old.snapshot_hash)) then raise exception 'IMMUTABLE_DOCUMENT' using errcode='23514';end if;return new;
end;$$;
create trigger immutable_packet_snapshot before update on app_private.consent_packets for each row execute function app_private.guard_packet_snapshot();

create function app_private.packet_clinical(p_appointment uuid) returns public.appointments language plpgsql security definer set search_path='' as $$
declare a public.appointments;tenant uuid:=app_private.current_tenant_id();begin
 perform 1 from public.tenants where id=tenant for update;
 select * into a from public.appointments where id=p_appointment and tenant_id=tenant for update;
 if not found or not public.can_access_client_clinical(a.client_id) then raise exception 'NOT_FOUND' using errcode='P0002';end if;return a;
end;$$;
create function public.consent_package_catalog() returns jsonb language plpgsql security definer set search_path='' as $$
declare u public.users:=app_private.management_owner();begin
 return jsonb_build_object('profile',(select jsonb_build_object('version',version,'details',details) from app_private.document_profiles where tenant_id=u.tenant_id),
 'items',(select coalesce(jsonb_agg(to_jsonb(p) order by p.content->>'title',p.id),'[]') from app_private.consent_packages p where tenant_id=u.tenant_id));
end;$$;
create function public.save_document_profile(p_version integer,p_details jsonb) returns void language plpgsql security definer set search_path='' as $$
declare u public.users:=app_private.management_owner();v integer;field text;begin
 if p_details is null or jsonb_typeof(p_details)<>'object' or length(p_details::text)>3000 or (select count(*) from jsonb_object_keys(p_details))<>7 then raise exception 'INVALID_PROFILE' using errcode='22023';end if;
 foreach field in array array['legal_name','tax_id','data_controller','address','email','phone'] loop
  if jsonb_typeof(p_details->field) is distinct from 'string' or length(btrim(p_details->>field)) not between 2 and (case field when 'legal_name' then 150 when 'data_controller' then 150 when 'tax_id' then 40 when 'email' then 254 when 'phone' then 40 else 300 end) then raise exception 'INVALID_PROFILE' using errcode='22023';end if;
 end loop;
 if jsonb_typeof(p_details->'pec') is distinct from 'string' or length(p_details->>'pec')>254 or (p_details->>'pec'<>'' and p_details->>'pec' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'INVALID_PROFILE' using errcode='22023';end if;
 if p_details->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_PROFILE' using errcode='22023';end if;
 select version into v from app_private.document_profiles where tenant_id=u.tenant_id;
 if coalesce(v,0) is distinct from p_version then raise exception 'STALE_VERSION' using errcode='40001';end if;
 insert into app_private.document_profiles values(u.tenant_id,p_version+1,p_details) on conflict(tenant_id) do update set version=excluded.version,details=excluded.details;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(u.tenant_id,u.id,'document_profile.save','tenants',u.tenant_id);
end;$$;
create function app_private.valid_package(p jsonb,p_publish boolean) returns boolean language plpgsql set search_path='' as $$
declare f text;q jsonb;ids text[]:='{}';begin
 if p is null or jsonb_typeof(p)<>'object' or length(p::text)>27000 or coalesce(p->>'key','') not in('microblading','lipblush') or jsonb_typeof(p->'revision') is distinct from 'number' or coalesce(p->>'revision','') !~ '^[1-9][0-9]{0,5}$' then return false;end if;
 foreach f in array array['title','source_date','source_scope','description','treatment_statement','introduction','aftercare','aftercare_statement','health_statement','photo_notice','photo_documentation','photo_demonstration','guardian_statement'] loop
  if jsonb_typeof(p->f) is distinct from 'string' or length(btrim(p->>f)) not between 2 and 8000 then return false;end if;
 end loop;
 if length(p->>'title')>120 or length(p->>'description')+length(p->>'treatment_statement')>11980 or jsonb_typeof(p->'questions') is distinct from 'array' then return false;end if;
 if jsonb_array_length(p->'questions') not between 1 and 30 then return false;end if;
 for q in select value from jsonb_array_elements(p->'questions') loop
  if coalesce(q->>'id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or q->>'id'=any(ids)
   or jsonb_typeof(q->'label') is distinct from 'string' or length(btrim(q->>'label')) not between 1 and 200
   or coalesce(q->>'type','') not in('text','yes_no') or jsonb_typeof(q->'required') is distinct from 'boolean' then return false;end if;
  ids:=array_append(ids,q->>'id');
 end loop;
 if p_publish then
  if p->'reviewed' is distinct from 'true'::jsonb or length(btrim(coalesce(p->>'privacy_notice','')))<50 or length(coalesce(p->>'privacy_notice',''))>10000
   or length(btrim(coalesce(p->>'jurisdiction','')))<2 or jsonb_typeof(p->'minors_enabled') is distinct from 'boolean' then return false;end if;
  if p->'minors_enabled'='true'::jsonb and (jsonb_typeof(p->'minimum_age') is distinct from 'number' or jsonb_typeof(p->'representatives_required') is distinct from 'number' or coalesce(p->>'minimum_age','') !~ '^[0-9]{1,2}$' or (p->>'minimum_age')::int not between 0 and 17
   or coalesce(p->>'representatives_required','') not in('1','2') or length(btrim(coalesce(p->>'minors_basis','')))<10) then return false;end if;
 end if;return true;
exception when others then return false;
end;$$;
create function public.save_consent_package(p_id uuid,p_version integer,p_service_id uuid,p_content jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u public.users:=app_private.management_owner();p app_private.consent_packages;begin
 if not app_private.valid_package(p_content,false) or not exists(select 1 from public.services where id=p_service_id and tenant_id=u.tenant_id and active) then raise exception 'INVALID_PACKAGE' using errcode='22023';end if;
 if p_id is null then
  if p_version is distinct from 0 then raise exception 'STALE_VERSION' using errcode='40001';end if;
  select * into p from app_private.consent_packages where tenant_id=u.tenant_id and service_id=p_service_id and origin=p_content->>'key';
  if found then return to_jsonb(p);end if;
  insert into app_private.consent_packages(tenant_id,service_id,origin,source_revision,content) values(u.tenant_id,p_service_id,p_content->>'key',(p_content->>'revision')::int,p_content) returning * into p;
 else
  select * into p from app_private.consent_packages where id=p_id and tenant_id=u.tenant_id;
  if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
  if p.version is distinct from p_version then raise exception 'STALE_VERSION' using errcode='40001';end if;
  if p.service_id<>p_service_id or p.origin<>p_content->>'key' then raise exception 'INVALID_PACKAGE' using errcode='22023';end if;
  update app_private.consent_packages set content=p_content,source_revision=(p_content->>'revision')::int,version=version+1 where id=p.id returning * into p;
 end if;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(u.tenant_id,u.id,'package.draft','consent_packages',p.id);return to_jsonb(p);
end;$$;
-- Ordinary edits cannot detach a native package from its reviewed declarations.
alter function public.publish_clinical_template(uuid,uuid,integer,text,text,text,jsonb,uuid) rename to publish_clinical_template_before_packages;
revoke all on function public.publish_clinical_template_before_packages(uuid,uuid,integer,text,text,text,jsonb,uuid) from public,anon,authenticated,service_role;
create function public.publish_clinical_template(p_request_id uuid,p_template_id uuid,p_version integer,p_kind text,p_title text,p_body text,p_questions jsonb,p_service_id uuid default null)
returns public.clinical_template_versions language plpgsql security definer set search_path='' as $$
declare u public.users:=app_private.management_owner();
begin
 if exists(select 1 from public.clinical_templates where id=p_template_id and tenant_id=u.tenant_id and package_id is not null) then raise exception 'PACKAGE_FLOW_REQUIRED' using errcode='22023';end if;
 return public.publish_clinical_template_before_packages(p_request_id,p_template_id,p_version,p_kind,p_title,p_body,p_questions,p_service_id);
end;$$;
create function public.publish_consent_package(p_id uuid,p_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare u public.users:=app_private.management_owner();p app_private.consent_packages;profile jsonb;c public.clinical_template_versions;a public.clinical_template_versions;ct public.clinical_templates;at public.clinical_templates;v app_private.consent_package_versions;begin
 select * into p from app_private.consent_packages where id=p_id and tenant_id=u.tenant_id;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if p.version is distinct from p_version then raise exception 'STALE_VERSION' using errcode='40001';end if;
 select details into profile from app_private.document_profiles where tenant_id=u.tenant_id;
 if profile is null or not app_private.valid_package(p.content,true) then raise exception 'PACKAGE_REVIEW_REQUIRED' using errcode='22023';end if;
 if p.published_version_id is not null then
  select * into v from app_private.consent_package_versions where id=p.published_version_id;
  if v.content=p.content and v.professional=profile then return to_jsonb(p);end if;
 end if;
 select * into ct from public.clinical_templates where package_id=p.id and kind='consent';
 select * into at from public.clinical_templates where package_id=p.id and kind='anamnesis';
 c:=public.publish_clinical_template_before_packages(gen_random_uuid(),ct.id,coalesce(ct.version,0),'consent',p.content->>'title',(p.content->>'description')||E'\n\n'||(p.content->>'treatment_statement'),'[]',p.service_id);
 a:=public.publish_clinical_template_before_packages(gen_random_uuid(),at.id,coalesce(at.version,0),'anamnesis',left('Anamnesi — '||(p.content->>'title'),120),p.content->>'introduction',p.content->'questions',p.service_id);
 update public.clinical_templates set package_id=p.id where id in(c.template_id,a.template_id);
 insert into app_private.consent_package_versions(tenant_id,package_id,revision,content,professional,consent_version_id,anamnesis_version_id,content_hash,published_by)
 values(u.tenant_id,p.id,p.published_revision+1,p.content,profile,c.id,a.id,encode(extensions.digest(jsonb_build_array(p.content,profile)::text,'sha256'),'hex'),u.id) returning * into v;
 update app_private.consent_packages set published_version_id=v.id,published_revision=v.revision,version=version+1 where id=p.id returning * into p;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(u.tenant_id,u.id,'package.publish','consent_packages',p.id);return to_jsonb(p);
end;$$;
-- The regular preparatory path stays available for existing models. Native
-- packages must go through the health-first, role-aware workflow below.
alter function public.save_treatment_preparation(uuid,uuid,integer,integer,uuid,uuid,jsonb,uuid[]) rename to save_treatment_preparation_before_packages;
revoke all on function public.save_treatment_preparation_before_packages(uuid,uuid,integer,integer,uuid,uuid,jsonb,uuid[]) from public,anon,authenticated,service_role;
create function public.save_treatment_preparation(p_request_id uuid,p_appointment_id uuid,p_appointment_version integer,p_version integer,p_consent_version_id uuid,p_anamnesis_version_id uuid,p_answers jsonb,p_lot_ids uuid[])
returns public.treatment_preparations language plpgsql security definer set search_path='' as $$
begin
 perform app_private.packet_clinical(p_appointment_id);
 if exists(select 1 from public.clinical_template_versions v join public.clinical_templates t on t.id=v.template_id where v.id in(p_consent_version_id,p_anamnesis_version_id) and v.tenant_id=app_private.current_tenant_id() and t.package_id is not null) then raise exception 'PACKAGE_FLOW_REQUIRED' using errcode='22023';end if;
 return public.save_treatment_preparation_before_packages(p_request_id,p_appointment_id,p_appointment_version,p_version,p_consent_version_id,p_anamnesis_version_id,p_answers,p_lot_ids);
end;$$;
-- Guard legacy link issuance as well as ordinary table/RPC callers.
do $$ declare fname text;def text;begin
 foreach fname in array array['create_signature_request','create_intake_link'] loop
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=fname;
  def:=replace(def,'begin',E'begin\n perform app_private.packet_clinical(p_appointment_id);\n if exists(select 1 from public.treatment_preparations package_guard_prep join public.clinical_template_versions package_guard_version on package_guard_version.id=package_guard_prep.consent_version_id join public.clinical_templates package_guard_template on package_guard_template.id=package_guard_version.template_id where package_guard_prep.appointment_id=p_appointment_id and package_guard_template.package_id is not null) then raise exception ''PACKAGE_FLOW_REQUIRED'' using errcode=''22023'';end if;');
  execute def;
 end loop;
end;$$;

create function public.available_consent_packages(p_appointment_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments:=app_private.packet_clinical(p_appointment_id);begin
 return (select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'title',v.content->>'title','revision',v.revision,'minors_enabled',v.content->'minors_enabled') order by v.content->>'title'),'[]')
 from app_private.consent_packages p join app_private.consent_package_versions v on v.id=p.published_version_id join public.services s on s.id=p.service_id
 where p.tenant_id=a.tenant_id and p.service_id=a.service_id and s.active and not exists(select 1 from public.clinical_template_versions checked_version join public.clinical_templates checked_template on checked_template.id=checked_version.template_id where checked_version.id in(v.consent_version_id,v.anamnesis_version_id) and not checked_template.active));
end;$$;
create function public.prepare_consent_packet(p_request_id uuid,p_appointment_id uuid,p_appointment_version integer,p_package_version_id uuid,p_details jsonb,p_lot_ids uuid[],p_mode text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments:=app_private.packet_clinical(p_appointment_id);t public.tenants;c public.clients;v app_private.consent_package_versions;pk app_private.consent_packages;
 prep public.treatment_preparations;r public.consent_requests;old app_private.consent_packets;party jsonb;person jsonb;token text;links jsonb:='[]';i int:=0;age int;day date;hash text;begin
 if p_request_id is null or p_details is null or jsonb_typeof(p_details)<>'object' or length(p_details::text)>6000 or p_mode is null or p_mode not in('link','tablet') then raise exception 'INVALID_PACKET' using errcode='22023';end if;
 select * into t from public.tenants where id=a.tenant_id;
 select * into c from public.clients where id=a.client_id;
 hash:=encode(extensions.digest(jsonb_build_array(p_appointment_id,p_appointment_version,p_package_version_id,p_details,p_lot_ids,p_mode)::text,'sha256'),'hex');
 select * into r from public.consent_requests where created_by=auth.uid() and request_id=p_request_id;
 if found then
  select * into old from app_private.consent_packets where id=r.id;
  if old.issue_hash is distinct from hash then raise exception 'IDEMPOTENCY_MISMATCH' using errcode='23505';end if;
  return jsonb_build_object('id',r.id,'links','[]'::jsonb);
 end if;
 if a.version is distinct from p_appointment_version then raise exception 'STALE_VERSION' using errcode='40001';end if;
 if a.status not in('booked','confirmed') or a.ends_at<=clock_timestamp() or c.archived_at is not null then raise exception 'TERMINAL_APPOINTMENT' using errcode='22023';end if;
 if (select count(*) from public.consent_requests where tenant_id=a.tenant_id and created_at>clock_timestamp()-interval '1 hour')>=60 then raise exception 'RATE_LIMIT' using errcode='54000';end if;
 select * into v from app_private.consent_package_versions where id=p_package_version_id and tenant_id=a.tenant_id;
 select * into pk from app_private.consent_packages where id=v.package_id and published_version_id=v.id and service_id=a.service_id;
 if v.id is null or pk.id is null or exists(select 1 from public.clinical_template_versions checked_version join public.clinical_templates checked_template on checked_template.id=checked_version.template_id where checked_version.id in(v.consent_version_id,v.anamnesis_version_id) and not checked_template.active) then raise exception 'INVALID_PACKAGE' using errcode='22023';end if;
 if jsonb_typeof(p_details->'verification_method') is distinct from 'string' or jsonb_typeof(p_details->'birthplace') is distinct from 'string' or length(p_details->>'verification_method')>1000 or length(p_details->>'birthplace')>150 or p_details->'identity_verified' is distinct from 'true'::jsonb or length(btrim(coalesce(p_details->>'verification_method','')))<10
 or length(btrim(coalesce(p_details->>'birthplace','')))<1 or coalesce(p_details->>'session_kind','') not in('first','retouch','maintenance')
 or coalesce(p_details->>'date_of_birth','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or jsonb_typeof(p_details->'representatives') is distinct from 'array' then raise exception 'INVALID_PACKET' using errcode='22023';end if;
 day:=(a.starts_at at time zone t.timezone)::date;
 if (p_details->>'date_of_birth')::date>least(day,(clock_timestamp() at time zone t.timezone)::date) or (p_details->>'date_of_birth')::date<day-interval '120 years' then raise exception 'INVALID_PACKET' using errcode='22023';end if;
 age:=extract(year from age(day,(p_details->>'date_of_birth')::date));
 if age>=18 and extract(year from age((clock_timestamp() at time zone t.timezone)::date,(p_details->>'date_of_birth')::date))<18 then raise exception 'BIRTHDAY_TRANSITION' using errcode='22023';end if;
 if age<18 then
  if v.content->'minors_enabled' is distinct from 'true'::jsonb or age<(v.content->>'minimum_age')::int or jsonb_array_length(p_details->'representatives') is distinct from (v.content->>'representatives_required')::int then raise exception 'MINOR_REQUIREMENTS' using errcode='22023';end if;
  for person in select value from jsonb_array_elements(p_details->'representatives') loop
   if jsonb_typeof(person->'name') is distinct from 'string' or jsonb_typeof(person->'contact') is distinct from 'string' or jsonb_typeof(person->'verification_method') is distinct from 'string' or person->'verified' is distinct from 'true'::jsonb or length(btrim(coalesce(person->>'name',''))) not between 2 and 150 or coalesce(person->>'role','') not in('parent','guardian') or length(btrim(coalesce(person->>'contact',''))) not between 3 and 254 or length(btrim(coalesce(person->>'verification_method',''))) not between 10 and 1000 then raise exception 'MINOR_REQUIREMENTS' using errcode='22023';end if;
  end loop;
  if (select count(distinct lower(btrim(x->>'name'))||'|'||lower(btrim(x->>'contact'))) from jsonb_array_elements(p_details->'representatives') x)<>jsonb_array_length(p_details->'representatives') then raise exception 'MINOR_REQUIREMENTS' using errcode='22023';end if;
 elsif jsonb_array_length(p_details->'representatives')<>0 then raise exception 'INVALID_PACKET' using errcode='22023';end if;
 select * into prep from public.treatment_preparations where appointment_id=a.id;
 prep:=public.save_treatment_preparation_before_packages(gen_random_uuid(),a.id,a.version,coalesce(prep.version,0),v.consent_version_id,v.anamnesis_version_id,'{}',p_lot_ids);
 update public.consent_requests set revoked_at=clock_timestamp(),version=version+1 where preparation_id=prep.id and used_at is null and revoked_at is null;
 update public.intake_links set revoked_at=clock_timestamp(),version=version+1 where preparation_id=prep.id and used_at is null and revoked_at is null;
 insert into public.consent_requests(tenant_id,appointment_id,preparation_id,appointment_version,preparation_version,mode,created_by,request_id,expires_at)
 values(a.tenant_id,a.id,prep.id,a.version,prep.version,p_mode,auth.uid(),p_request_id,least(a.ends_at,clock_timestamp()+case when p_mode='tablet' then interval '30 minutes' else interval '24 hours' end)) returning * into r;
 insert into app_private.consent_packets(id,tenant_id,client_id,package_version_id,details,client_version,issue_hash) values(r.id,a.tenant_id,c.id,v.id,p_details,c.version,hash);
 if age>=18 then party:=jsonb_build_array(jsonb_build_object('name',c.first_name||' '||c.last_name,'role','self','contact',coalesce(c.email,c.phone,'In studio'),'verification_method',p_details->>'verification_method'));else party:=p_details->'representatives';end if;
 for person in select value from jsonb_array_elements(party) loop
  i:=i+1;token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into app_private.consent_packet_parties(tenant_id,packet_id,ordinal,identity,token_hash) values(a.tenant_id,r.id,i,person||jsonb_build_object('verified_by',auth.uid(),'verified_at',clock_timestamp()),encode(extensions.digest(token,'sha256'),'hex'));
  links:=links||jsonb_build_array(jsonb_build_object('name',person->>'name','role',person->>'role','contact',person->>'contact','token',token));
 end loop;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(a.tenant_id,auth.uid(),'packet.issue','consent_requests',r.id);
 return jsonb_build_object('id',r.id,'links',links);
end;$$;
create function app_private.lock_valid_packet(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.consent_requests;a public.appointments;p public.treatment_preparations;c public.clients;issuer public.users;s app_private.consent_packets;begin
 select * into r from public.consent_requests where id=p_id;
 if not found then return false;end if;
 perform 1 from public.tenants where id=r.tenant_id for update;
 select * into a from public.appointments where id=r.appointment_id for update;
 select * into r from public.consent_requests where id=p_id for update;
 select * into p from public.treatment_preparations where id=r.preparation_id for update;
 select * into s from app_private.consent_packets where id=p_id;
 select * into c from public.clients where id=s.client_id;
 select * into issuer from public.users where id=r.created_by;
 if r.revoked_at is not null or r.expires_at<=clock_timestamp() or c.archived_at is not null or c.version<>s.client_version
 or a.version<>r.appointment_version or p.version<>r.preparation_version or p.appointment_version<>a.version
 or a.status not in('booked','confirmed') or a.ends_at<=clock_timestamp() or not issuer.active or issuer.tenant_id<>r.tenant_id
 or (issuer.role<>'owner' and (not issuer.clinical_access or not exists(select 1 from public.client_assignments ca where ca.client_id=c.id and ca.operator_id=issuer.id and ca.active))) then return false;end if;
 if exists(select 1 from public.treatment_lots tl join public.pigment_lots l on l.id=tl.lot_id join public.pigments g on g.id=l.pigment_id
  where tl.preparation_id=p.id and (not l.active or not g.active or l.expires_on<greatest((clock_timestamp() at time zone (select timezone from public.tenants where id=r.tenant_id))::date,(a.starts_at at time zone (select timezone from public.tenants where id=r.tenant_id))::date)
  or (tl.snapshot->>'expires_on')::date<greatest((clock_timestamp() at time zone (select timezone from public.tenants where id=r.tenant_id))::date,(a.starts_at at time zone (select timezone from public.tenants where id=r.tenant_id))::date))) then return false;end if;
 return true;
end;$$;
create function public.read_consent_packets(p_appointment_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments:=app_private.packet_clinical(p_appointment_id);begin
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(a.tenant_id,auth.uid(),'packet.read','appointments',a.id);
 return (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'version',r.version,'revoked',r.revoked_at is not null,'expires_at',r.expires_at,'document_id',s.document_id,
 'ready_to_countersign',s.snapshot is not null and not exists(select 1 from app_private.consent_packet_parties pp where pp.packet_id=s.id and pp.signature is null) and r.revoked_at is null,
 'parties',(select jsonb_agg(jsonb_build_object('id',pp.id,'ordinal',pp.ordinal,'identity',pp.identity,'health',pp.health,'signed',pp.signature is not null) order by pp.ordinal) from app_private.consent_packet_parties pp where pp.packet_id=s.id),
 'snapshot_hash',s.snapshot_hash,'details',s.details) order by s.created_at desc),'[]')
 from app_private.consent_packets s join public.consent_requests r on r.id=s.id where r.appointment_id=a.id);
end;$$;
create function public.rotate_packet_party(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare pp app_private.consent_packet_parties;r public.consent_requests;a public.appointments;token text;begin
 select * into pp from app_private.consent_packet_parties where id=p_id;
 select * into r from public.consent_requests where id=pp.packet_id;
 a:=app_private.packet_clinical(r.appointment_id);
 if pp.id is null or not app_private.lock_valid_packet(r.id) or r.used_at is not null then raise exception 'INVALID_PACKET' using errcode='22023';end if;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 update app_private.consent_packet_parties set token_hash=encode(extensions.digest(token,'sha256'),'hex') where id=pp.id;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(a.tenant_id,auth.uid(),'packet.rotate','consent_requests',r.id);
 return jsonb_build_object('name',pp.identity->>'name','role',pp.identity->>'role','contact',pp.identity->>'contact','token',token);
end;$$;
create function app_private.packet_context(p_party uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare pp app_private.consent_packet_parties;s app_private.consent_packets;v app_private.consent_package_versions;r public.consent_requests;stage text;begin
 select * into pp from app_private.consent_packet_parties where id=p_party;
 select * into s from app_private.consent_packets where id=pp.packet_id;
 select * into v from app_private.consent_package_versions where id=s.package_version_id;
 select * into r from public.consent_requests where id=s.id;
 stage:=case when pp.health is null then 'health'
 when exists(select 1 from app_private.consent_packet_parties where packet_id=s.id and health->'allowed'='false'::jsonb) then 'declined'
 when pp.signature is not null then 'signed'
 when exists(select 1 from app_private.consent_packet_parties where packet_id=s.id and health is null) then 'waiting'
 when s.snapshot is null and pp.ordinal=1 then 'answers'
 when s.snapshot is null then 'waiting' else 'sign' end;
 return jsonb_build_object('id',s.id,'party_id',pp.id,'stage',stage,'studio',coalesce(s.snapshot->>'studio',(select name from public.tenants where id=s.tenant_id)),
 'client_name',coalesce(s.snapshot->>'client_name',(select first_name||' '||last_name from public.clients where id=s.client_id)),
 'starts_at',coalesce(s.snapshot->'starts_at',(select to_jsonb(starts_at) from public.appointments where id=r.appointment_id)),
 'timezone',coalesce(s.snapshot->>'timezone',(select timezone from public.tenants where id=s.tenant_id)),
 'role',pp.identity->>'role','signer_name',pp.identity->>'name',
 'content',v.content,'professional',v.professional,'details',s.details-'representatives','expires_at',r.expires_at,'snapshot_hash',s.snapshot_hash,
 'answers',case when stage='sign' then s.snapshot->'answers' else '{}'::jsonb end,'snapshot',case when stage='sign' then s.snapshot else null end);
end;$$;
create function public.use_consent_packet(p_token_hash text,p_action text,p_input jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare pp app_private.consent_packet_parties;s app_private.consent_packets;v app_private.consent_package_versions;r public.consent_requests;
 a public.appointments;prep public.treatment_preparations;cv public.clinical_template_versions;av public.clinical_template_versions;t public.tenants;
 q jsonb;entry record;ans jsonb;frozen jsonb;receipt jsonb;hash text;attempts int;minute timestamptz:=date_trunc('minute',clock_timestamp());
 denied constant jsonb:='{"ok":false,"status":410,"code":"PACKET_UNAVAILABLE"}';begin
 insert into app_private.signature_rate_limits values('global',minute,1) on conflict(key,window_start) do update set attempts=app_private.signature_rate_limits.attempts+1 returning signature_rate_limits.attempts into attempts;
 delete from app_private.signature_rate_limits where window_start<minute-interval '1 hour';
 if attempts>300 then return '{"ok":false,"status":429,"code":"RATE_LIMIT"}';end if;
 if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then return denied;end if;
 insert into app_private.signature_rate_limits values(p_token_hash,minute,1) on conflict(key,window_start) do update set attempts=app_private.signature_rate_limits.attempts+1 returning signature_rate_limits.attempts into attempts;
 if attempts>30 then return '{"ok":false,"status":429,"code":"RATE_LIMIT"}';end if;
 select * into pp from app_private.consent_packet_parties where token_hash=p_token_hash;
 if not found or not app_private.lock_valid_packet(pp.packet_id) then return denied;end if;
 -- Re-read after the lock; a concurrent token rotation invalidates this call.
 select * into pp from app_private.consent_packet_parties where token_hash=p_token_hash;
 if not found then return denied;end if;
 select * into s from app_private.consent_packets where id=pp.packet_id;
 select * into v from app_private.consent_package_versions where id=s.package_version_id;
 select * into r from public.consent_requests where id=s.id;
 hash:=encode(extensions.digest(p_input::text,'sha256'),'hex');
 if p_action='sign' and pp.signature is not null then
  if pp.submission_hash=hash then return jsonb_build_object('ok',true,'context',app_private.packet_context(pp.id));end if;return denied;
 end if;
 if r.used_at is not null then return denied;end if;
 if p_action='label' then
  if s.snapshot is null or not exists(select 1 from jsonb_array_elements(s.snapshot->'lots') lot_entry where lot_entry->>'label_file_id'=p_input->>'id') then return denied;end if;
  insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(s.tenant_id,null,'packet.label','consent_requests',s.id);
  return jsonb_build_object('ok',true,'file',(select jsonb_build_object('path',sf.object_path,'sha256',sf.sha256,'size',sf.size_bytes,'mime',sf.mime_type) from public.stored_files sf where sf.id=(p_input->>'id')::uuid and sf.tenant_id=s.tenant_id and sf.state='ready' and sf.sha256=(select lot_entry->>'label_sha256' from jsonb_array_elements(s.snapshot->'lots') lot_entry where lot_entry->>'label_file_id'=p_input->>'id' limit 1)));
 elsif p_action='read' then
  insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(s.tenant_id,null,'packet.open','consent_requests',s.id);
 elsif p_action='health' then
  if p_input is null or jsonb_typeof(p_input->'allowed') is distinct from 'boolean' then return '{"ok":false,"status":422,"code":"INVALID_PACKET"}';end if;
  if pp.health is not null then
   if pp.health->'allowed' is distinct from p_input->'allowed' then return denied;end if;
  else
   receipt:=jsonb_build_object('allowed',p_input->'allowed','at',clock_timestamp(),'signer',pp.identity,'statement',v.content->>'health_statement','privacy_notice',v.content->>'privacy_notice','package_hash',v.content_hash);
   update app_private.consent_packet_parties set health=receipt where id=pp.id;
   insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(s.tenant_id,null,'packet.health','consent_requests',s.id);
  end if;
 elsif p_action='answers' then
  if pp.ordinal<>1 or exists(select 1 from app_private.consent_packet_parties where packet_id=s.id and (health is null or health->'allowed' is distinct from 'true'::jsonb)) then return denied;end if;
  ans:=p_input->'answers';
  if ans is null or jsonb_typeof(ans)<>'object' or length(ans::text)>17000 then return '{"ok":false,"status":422,"code":"INVALID_ANSWERS"}';end if;
  if s.snapshot is not null then
   if s.snapshot->'answers'=ans then return jsonb_build_object('ok',true,'context',app_private.packet_context(pp.id));end if;return denied;
  end if;
  for entry in select key,value from jsonb_each(ans) loop
   select value into q from jsonb_array_elements(v.content->'questions') where value->>'id'=entry.key;
   if not found or (q->>'type'='yes_no' and jsonb_typeof(entry.value)<>'boolean') or (q->>'type'='text' and (jsonb_typeof(entry.value)<>'string' or length(entry.value#>>'{}')>500)) then return '{"ok":false,"status":422,"code":"INVALID_ANSWERS"}';end if;
  end loop;
  for q in select value from jsonb_array_elements(v.content->'questions') loop
   if q->'required'='true'::jsonb and (not(ans ? (q->>'id')) or (q->>'type'='text' and length(btrim(ans->>(q->>'id')))=0)) then return '{"ok":false,"status":422,"code":"INCOMPLETE_ANSWERS"}';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(v.content->'questions') qq where qq->>'type'='yes_no' and ans->(qq->>'id')='true'::jsonb)
   and not exists(select 1 from jsonb_array_elements(v.content->'questions') qq where qq->>'type'='text' and length(btrim(coalesce(ans->>(qq->>'id'),'')))>0) then return '{"ok":false,"status":422,"code":"DETAILS_REQUIRED"}';end if;
  select * into a from public.appointments where id=r.appointment_id;
  select * into prep from public.treatment_preparations where id=r.preparation_id;
  select * into cv from public.clinical_template_versions where id=prep.consent_version_id;
  select * into av from public.clinical_template_versions where id=prep.anamnesis_version_id;
  select * into t from public.tenants where id=s.tenant_id;
  frozen:=jsonb_build_object('schema',1,'studio',t.name,'timezone',t.timezone,'client_name',(select first_name||' '||last_name from public.clients where id=s.client_id),'service_name',a.service_name,'starts_at',a.starts_at,
   'consent',jsonb_build_object('id',cv.id,'revision',cv.revision,'title',cv.title,'body',cv.body,'content_hash',cv.content_hash),
   'anamnesis',jsonb_build_object('id',av.id,'revision',av.revision,'title',av.title,'body',av.body,'questions',av.questions,'content_hash',av.content_hash),
   'answers',ans,'lots',(select coalesce(jsonb_agg(snapshot order by id),'[]') from public.treatment_lots where preparation_id=prep.id),
   'packet',jsonb_build_object('schema','glow-pmu-v1','content',v.content,'professional',v.professional,'details',s.details,'package_hash',v.content_hash,
    'health_receipts',(select jsonb_agg(health order by ordinal) from app_private.consent_packet_parties where packet_id=s.id)));
  update app_private.preparation_answers set answers=ans where preparation_id=prep.id;
  update app_private.consent_packets set snapshot=frozen,snapshot_hash=encode(extensions.digest(frozen::text,'sha256'),'hex') where id=s.id;
  insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(s.tenant_id,null,'packet.answers','consent_requests',s.id);
 elsif p_action='sign' then
  if s.snapshot is null or p_input->>'snapshot_hash' is distinct from s.snapshot_hash or p_input->'confirmed' is distinct from 'true'::jsonb
   or p_input->'aftercare_received' is distinct from 'true'::jsonb or p_input->'authority_confirmed' is distinct from 'true'::jsonb
   or not app_private.valid_handwriting(p_input->'signature') or coalesce(p_input->>'request_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
   or jsonb_typeof(p_input->'photo_documentation') is distinct from 'boolean' or jsonb_typeof(p_input->'photo_demonstration') is distinct from 'boolean'
   or coalesce(p_input->>'photo_scope','') not in('none','detail','recognizable')
   or (p_input->'photo_demonstration'='true'::jsonb and (p_input->'photo_documentation'<>'true'::jsonb or p_input->>'photo_scope'='none'))
   or (p_input->'photo_demonstration'='false'::jsonb and p_input->>'photo_scope'<>'none') then return '{"ok":false,"status":422,"code":"INVALID_SIGNATURE"}';end if;
  receipt:=jsonb_build_object('signer',pp.identity,'at',clock_timestamp(),'input',p_input,'snapshot_hash',s.snapshot_hash,
   'treatment_statement',v.content->>'treatment_statement','aftercare_statement',v.content->>'aftercare_statement','guardian_statement',case when pp.identity->>'role'='self' then null else v.content->>'guardian_statement' end);
  update app_private.consent_packet_parties set signature=receipt,submission_hash=hash where id=pp.id;
  insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(s.tenant_id,null,'packet.signed','consent_requests',s.id);
 else return denied;end if;
 return jsonb_build_object('ok',true,'context',app_private.packet_context(pp.id));
end;$$;

alter table public.consents drop constraint consents_renderer_check;
alter table public.consents add constraint consents_renderer_check check(renderer in('glow-pdf-v1','glow-pdf-v2','glow-pdf-v3'));
alter table public.photo_permissions add column image_scope text check(image_scope in('none','detail','recognizable'));
create function public.countersign_consent_packet(p_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.consent_requests;a public.appointments;s app_private.consent_packets;pp app_private.consent_packet_parties;counter app_private.consent_packet_countersignatures;u public.users;doc public.consents;
 payload jsonb;receipt jsonb;hash text;stamp timestamptz:=clock_timestamp();documentation boolean;demonstration boolean;scope text;begin
 select * into r from public.consent_requests where id=p_id;
 a:=app_private.packet_clinical(r.appointment_id);
 select * into s from app_private.consent_packets where id=p_id;
 if s.id is null then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 hash:=encode(extensions.digest(p_input::text,'sha256'),'hex');
 select * into counter from app_private.consent_packet_countersignatures where packet_id=s.id;
 if found then
  if counter.submission_hash=hash then return jsonb_build_object('id',s.document_id);end if;
  raise exception 'IDEMPOTENCY_MISMATCH' using errcode='23505';
 end if;
 if not app_private.lock_valid_packet(s.id) or s.snapshot is null or exists(select 1 from app_private.consent_packet_parties where packet_id=s.id and signature is null) then raise exception 'PACKET_INCOMPLETE' using errcode='22023';end if;
 select * into u from public.users where id=auth.uid();
 -- Counter-signature belongs to the assigned practitioner, not any logged-in
 -- account. Owners can reassign the appointment through the existing workflow.
 if a.operator_id<>u.id then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_input->>'snapshot_hash' is distinct from s.snapshot_hash or p_input->'confirmed' is distinct from 'true'::jsonb or not app_private.valid_handwriting(p_input->'signature') then raise exception 'INVALID_PACKET' using errcode='22023';end if;
 select * into pp from app_private.consent_packet_parties where packet_id=s.id order by ordinal limit 1;
 receipt:=jsonb_build_object('name',u.display_name,'actor_id',u.id,'at',stamp,'snapshot_hash',s.snapshot_hash,'signature',p_input->'signature','statement','Confermo la verifica delle identità e dei poteri di rappresentanza, l’esame delle risposte e la consegna delle informazioni del trattamento.');
 select bool_and((signature->'input'->>'photo_documentation')::boolean),bool_and((signature->'input'->>'photo_demonstration')::boolean) into documentation,demonstration from app_private.consent_packet_parties where packet_id=s.id;
 scope:=case when not demonstration then 'none' when exists(select 1 from app_private.consent_packet_parties where packet_id=s.id and signature->'input'->>'photo_scope'='detail') then 'detail' else 'recognizable' end;
 payload:=jsonb_build_object('snapshot',s.snapshot,'snapshot_hash',s.snapshot_hash,'signer_name',pp.identity->>'name','signature',pp.signature->'input'->'signature','signed_at',stamp,
 'statement','Consenso al trattamento e ricezione delle istruzioni confermati dai firmatari indicati.','signature_kind','drawn-v1',
 'photo_choices',jsonb_build_object('documentation',documentation,'demonstration',demonstration),
 'packet_signatures',(select jsonb_agg(signature order by ordinal) from app_private.consent_packet_parties where packet_id=s.id),'counter_signature',receipt);
 insert into public.consents(tenant_id,request_id,appointment_id,client_id,preparation_version,signed_at,previous_id,content_hash,renderer)
 values(s.tenant_id,r.id,a.id,s.client_id,r.preparation_version,stamp,(select id from public.consents where appointment_id=a.id order by signed_at desc,id desc limit 1),encode(extensions.digest(payload::text,'sha256'),'hex'),'glow-pdf-v3') returning * into doc;
 insert into app_private.signed_payloads values(doc.id,payload,gen_random_uuid(),hash);
 insert into app_private.document_jobs(consent_id) values(doc.id);
 insert into app_private.consent_packet_countersignatures values(s.id,receipt,hash);
 update app_private.consent_packets set document_id=doc.id where id=s.id;
 update public.consent_requests set used_at=stamp,version=version+1 where id=s.id;
 update public.photo_permissions set superseded_at=stamp,version=version+1 where appointment_id=a.id and superseded_at is null;
 insert into public.photo_permissions(tenant_id,client_id,appointment_id,purpose,allowed,consent_id,signed_at,image_scope) values
 (s.tenant_id,s.client_id,a.id,'documentation',documentation,doc.id,stamp,case when documentation then 'detail' else 'none' end),
 (s.tenant_id,s.client_id,a.id,'demonstration',demonstration,doc.id,stamp,scope);
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(s.tenant_id,u.id,'packet.countersigned','consents',doc.id);
 return jsonb_build_object('id',doc.id);
end;$$;
-- Export pending, declined and revoked evidence too, excluding capability hashes.
alter function app_private.client_export_snapshot(uuid) rename to client_export_snapshot_before_packages;
create function app_private.client_export_snapshot(p_client uuid) returns jsonb language sql security definer set search_path='' as $$
 select app_private.client_export_snapshot_before_packages(p_client)||jsonb_build_object('consent_packets',
 (select coalesce(jsonb_agg((to_jsonb(s)-'issue_hash')||jsonb_build_object('parties',(select jsonb_agg(to_jsonb(pp)-'token_hash'-'submission_hash' order by ordinal) from app_private.consent_packet_parties pp where pp.packet_id=s.id),'counter_signature',(select receipt from app_private.consent_packet_countersignatures where packet_id=s.id)) order by s.created_at,s.id),'[]') from app_private.consent_packets s where s.client_id=p_client));
$$;
-- Even a never-finalised packet contains evidence and protects its contact.
alter function app_private.deletion_status(text,uuid,uuid) rename to deletion_status_before_packages;
create function app_private.deletion_status(p_kind text,p_id uuid,p_tenant uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:=app_private.deletion_status_before_packages(p_kind,p_id,p_tenant);begin
 if (p_kind='clients' and exists(select 1 from app_private.consent_packets where client_id=p_id and tenant_id=p_tenant)) then
  return result||jsonb_build_object('allowed',false,'reasons',(result->'reasons')||'"clinical_records"'::jsonb);
 elsif p_kind='services' and exists(select 1 from app_private.consent_packages where service_id=p_id and tenant_id=p_tenant) then
  return result||jsonb_build_object('allowed',false,'reasons',(result->'reasons')||'"clinical_templates"'::jsonb);
 end if;return result;
end;$$;
-- Central functions keep the explicit grants pattern. No default PUBLIC access.
do $$ declare p record;begin
 for p in select n.nspname,pr.oid::regprocedure signature from pg_proc pr join pg_namespace n on n.oid=pr.pronamespace where n.nspname='app_private' and pr.proname in('guard_packet_evidence','guard_packet_snapshot','packet_clinical','valid_package','lock_valid_packet','packet_context','client_export_snapshot','client_export_snapshot_before_packages','deletion_status','deletion_status_before_packages') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',p.signature);
 end loop;
end;$$;
revoke all on function public.consent_package_catalog(),public.save_document_profile(integer,jsonb),public.save_consent_package(uuid,integer,uuid,jsonb),public.publish_consent_package(uuid,integer),public.available_consent_packages(uuid),public.prepare_consent_packet(uuid,uuid,integer,uuid,jsonb,uuid[],text),public.read_consent_packets(uuid),public.rotate_packet_party(uuid),public.countersign_consent_packet(uuid,jsonb),public.publish_clinical_template(uuid,uuid,integer,text,text,text,jsonb,uuid),public.save_treatment_preparation(uuid,uuid,integer,integer,uuid,uuid,jsonb,uuid[]) from public,anon;
grant execute on function public.consent_package_catalog(),public.save_document_profile(integer,jsonb),public.save_consent_package(uuid,integer,uuid,jsonb),public.publish_consent_package(uuid,integer),public.available_consent_packages(uuid),public.prepare_consent_packet(uuid,uuid,integer,uuid,jsonb,uuid[],text),public.read_consent_packets(uuid),public.rotate_packet_party(uuid),public.countersign_consent_packet(uuid,jsonb),public.publish_clinical_template(uuid,uuid,integer,text,text,text,jsonb,uuid),public.save_treatment_preparation(uuid,uuid,integer,integer,uuid,uuid,jsonb,uuid[]) to authenticated;
revoke all on function public.use_consent_packet(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.use_consent_packet(text,text,jsonb) to service_role;
alter function public.read_treatment_preparation(uuid) rename to read_treatment_preparation_before_packages;
revoke all on function public.read_treatment_preparation_before_packages(uuid) from public,anon,authenticated,service_role;
create function public.read_treatment_preparation(p_appointment_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:=public.read_treatment_preparation_before_packages(p_appointment_id);begin
 return result||jsonb_build_object('native_packet',exists(select 1 from public.treatment_preparations p join public.clinical_template_versions v on v.id=p.consent_version_id join public.clinical_templates t on t.id=v.template_id where p.appointment_id=p_appointment_id and t.package_id is not null));
end;$$;
revoke all on function public.read_treatment_preparation(uuid) from public,anon;
grant execute on function public.read_treatment_preparation(uuid) to authenticated;
create function public.read_packet_review(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s app_private.consent_packets;r public.consent_requests;a public.appointments;begin
 select * into r from public.consent_requests where id=p_id;a:=app_private.packet_clinical(r.appointment_id);
 select * into s from app_private.consent_packets where id=p_id;
 if s.id is null or s.tenant_id<>a.tenant_id then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(a.tenant_id,auth.uid(),'packet.review','consent_requests',s.id);
 return jsonb_build_object('snapshot',s.snapshot,'parties',(select jsonb_agg(signature order by ordinal) from app_private.consent_packet_parties where packet_id=s.id));
end;$$;
revoke all on function public.read_packet_review(uuid) from public,anon;
grant execute on function public.read_packet_review(uuid) to authenticated;
