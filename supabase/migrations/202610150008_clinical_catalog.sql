-- Versioned professional-authored texts. No seed implies medical/legal approval.
create function app_private.is_clinical() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.users where id=auth.uid() and active and (role='owner' or clinical_access));
$$;
revoke all on function app_private.is_clinical() from public,anon;
grant execute on function app_private.is_clinical() to authenticated;

create table public.clinical_templates (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 kind text not null check(kind in('consent','anamnesis')), title text not null check(char_length(title) between 2 and 120),
 service_id uuid, active boolean not null default true, version integer not null default 1 check(version>0),
 current_revision integer not null default 1 check(current_revision>0), current_version_id uuid not null,
 created_at timestamptz not null default now(), unique(tenant_id,id),
 foreign key(tenant_id,service_id) references public.services(tenant_id,id)
);
create table public.clinical_template_versions (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), template_id uuid not null,
 revision integer not null check(revision>0), title text not null, body text not null check(char_length(body) between 10 and 12000),
 questions jsonb not null default '[]' check(jsonb_typeof(questions)='array' and jsonb_array_length(questions)<=30),
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'), created_by uuid not null,
 published_at timestamptz not null default now(), unique(tenant_id,id), unique(tenant_id,template_id,id), unique(template_id,revision),
 foreign key(tenant_id,template_id) references public.clinical_templates(tenant_id,id),
 foreign key(tenant_id,created_by) references public.users(tenant_id,id)
);
alter table public.clinical_templates add foreign key(tenant_id,id,current_version_id)
 references public.clinical_template_versions(tenant_id,template_id,id) deferrable initially deferred;
create index clinical_templates_page on public.clinical_templates(tenant_id,created_at desc,id);
create function app_private.immutable_clinical_revision() returns trigger
language plpgsql set search_path='' as $$ begin raise exception 'IMMUTABLE_REVISION' using errcode='55000'; end; $$;
revoke all on function app_private.immutable_clinical_revision() from public,anon,authenticated;
create trigger immutable_revision before update or delete on public.clinical_template_versions for each row execute function app_private.immutable_clinical_revision();

create table public.pigments (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 brand text not null check(char_length(brand) between 1 and 100), name text not null check(char_length(name) between 1 and 100),
 code text not null default '' check(char_length(code)<=100), active boolean not null default true,
 version integer not null default 1 check(version>0), created_at timestamptz not null default now(), unique(tenant_id,id)
);
create index pigments_page on public.pigments(tenant_id,created_at desc,id);

-- Extend file scope for manufacturer labels, not generic client uploads.
alter table public.stored_files alter column client_id drop not null;
alter table public.stored_files drop constraint stored_files_kind_check;
alter table public.stored_files add column pigment_id uuid;
alter table public.stored_files add foreign key(tenant_id,pigment_id) references public.pigments(tenant_id,id);
alter table public.stored_files add check(kind in('client_photo','pigment_label'));
alter table public.stored_files add check((kind='client_photo' and client_id is not null and pigment_id is null) or
 (kind='pigment_label' and client_id is null and appointment_id is null and pigment_id is not null));

create table public.pigment_lots (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), pigment_id uuid not null,
 lot_number text not null check(char_length(lot_number) between 1 and 100), expires_on date not null,
 label_file_id uuid not null, label_text text not null default '' check(char_length(label_text)<=2000),
 active boolean not null default true, version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(), unique(tenant_id,id),
 foreign key(tenant_id,pigment_id) references public.pigments(tenant_id,id),
 foreign key(tenant_id,label_file_id) references public.stored_files(tenant_id,id)
);
create unique index pigment_lot_number on public.pigment_lots(tenant_id,pigment_id,lower(lot_number));
create index pigment_lots_page on public.pigment_lots(tenant_id,created_at desc,id);

create table public.treatment_preparations (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 appointment_id uuid not null unique, client_id uuid not null, consent_version_id uuid not null, anamnesis_version_id uuid,
 appointment_version integer not null, version integer not null default 1 check(version>0),
 status text not null default 'draft' check(status='draft'), created_by uuid not null, updated_by uuid not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(tenant_id,id),
 foreign key(tenant_id,appointment_id) references public.appointments(tenant_id,id),
 foreign key(tenant_id,client_id) references public.clients(tenant_id,id),
 foreign key(tenant_id,consent_version_id) references public.clinical_template_versions(tenant_id,id),
 foreign key(tenant_id,anamnesis_version_id) references public.clinical_template_versions(tenant_id,id),
 foreign key(tenant_id,created_by) references public.users(tenant_id,id), foreign key(tenant_id,updated_by) references public.users(tenant_id,id)
);
create table app_private.preparation_answers (
 preparation_id uuid primary key references public.treatment_preparations(id), answers jsonb not null default '{}' check(jsonb_typeof(answers)='object')
);
revoke all on app_private.preparation_answers from public,anon,authenticated;
alter table app_private.preparation_answers enable row level security;
create table public.treatment_lots (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), preparation_id uuid not null,
 lot_id uuid not null, snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 unique(preparation_id,lot_id), foreign key(tenant_id,preparation_id) references public.treatment_preparations(tenant_id,id),
 foreign key(tenant_id,lot_id) references public.pigment_lots(tenant_id,id)
);

alter table public.clinical_templates enable row level security;
alter table public.clinical_template_versions enable row level security;
alter table public.pigments enable row level security;
alter table public.pigment_lots enable row level security;
alter table public.treatment_preparations enable row level security;
alter table public.treatment_lots enable row level security;
create policy templates_read on public.clinical_templates for select to authenticated using(tenant_id=app_private.current_tenant_id() and app_private.is_clinical());
create policy versions_read on public.clinical_template_versions for select to authenticated using(tenant_id=app_private.current_tenant_id() and app_private.is_clinical());
create policy pigments_read on public.pigments for select to authenticated using(tenant_id=app_private.current_tenant_id() and app_private.is_clinical());
create policy lots_read on public.pigment_lots for select to authenticated using(tenant_id=app_private.current_tenant_id() and app_private.is_clinical());
create policy preparations_read on public.treatment_preparations for select to authenticated using(public.can_access_client_clinical(client_id));
create policy treatment_lots_read on public.treatment_lots for select to authenticated using(exists(select 1 from public.treatment_preparations p where p.id=preparation_id and public.can_access_client_clinical(p.client_id)));
revoke all on public.clinical_templates,public.clinical_template_versions,public.pigments,public.pigment_lots,public.treatment_preparations,public.treatment_lots from public,anon,authenticated;
grant select on public.clinical_templates,public.clinical_template_versions,public.pigments,public.pigment_lots,public.treatment_preparations,public.treatment_lots to authenticated;
create trigger audit_templates after insert or update on public.clinical_templates for each row execute function app_private.audit_mutation();
create trigger audit_template_versions after insert on public.clinical_template_versions for each row execute function app_private.audit_mutation();
create trigger audit_pigments after insert or update on public.pigments for each row execute function app_private.audit_mutation();
create trigger audit_lots after insert or update on public.pigment_lots for each row execute function app_private.audit_mutation();
create trigger audit_preparations after insert or update on public.treatment_preparations for each row execute function app_private.audit_mutation();

create function public.publish_clinical_template(p_request_id uuid,p_template_id uuid,p_version integer,p_kind text,p_title text,p_body text,p_questions jsonb,p_service_id uuid default null)
returns public.clinical_template_versions language plpgsql security definer set search_path='' as $$
declare profile public.users; t public.clinical_templates; v public.clinical_template_versions; q jsonb; ids text[]:='{}'; request_hash text; previous app_private.idempotency_requests; target uuid:=coalesce(p_template_id,gen_random_uuid()); revision_id uuid:=gen_random_uuid();
begin
 select * into profile from public.users where id=auth.uid() and active and role='owner';
 if not found then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.tenants where id=profile.tenant_id for update;
 if p_request_id is null or p_kind is null or p_kind not in('consent','anamnesis') or p_title is null or char_length(btrim(p_title)) not between 2 and 120 or p_body is null or char_length(btrim(p_body)) not between 10 and 12000 then raise exception 'INVALID_TEMPLATE' using errcode='22023'; end if;
 if p_questions is null or jsonb_typeof(p_questions)<>'array' or jsonb_array_length(p_questions)>30 then raise exception 'INVALID_QUESTIONS' using errcode='22023'; end if;
 if p_kind='consent' and jsonb_array_length(p_questions)<>0 then raise exception 'INVALID_QUESTIONS' using errcode='22023'; end if;
 for q in select value from jsonb_array_elements(p_questions) loop
  if jsonb_typeof(q)<>'object' or (select count(*) from jsonb_object_keys(q))<>4 or jsonb_typeof(q->'id') is distinct from 'string' or (q->>'id') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or (q->>'id')=any(ids) or jsonb_typeof(q->'label') is distinct from 'string' or char_length(btrim(q->>'label')) not between 1 and 200 or (q->>'type') is null or (q->>'type') not in('yes_no','text') or jsonb_typeof(q->'required') is distinct from 'boolean' then raise exception 'INVALID_QUESTIONS' using errcode='22023'; end if;
  ids:=array_append(ids,q->>'id');
 end loop;
 request_hash:=encode(extensions.digest(jsonb_build_array(p_template_id,p_version,p_kind,p_title,p_body,p_questions,p_service_id)::text,'sha256'),'hex');
 select * into previous from app_private.idempotency_requests where actor_id=auth.uid() and operation='clinical_template.publish' and request_key=p_request_id;
 if found then
  if previous.request_hash<>request_hash then raise exception 'IDEMPOTENCY_MISMATCH' using errcode='23505'; end if;
  select * into v from public.clinical_template_versions where id=previous.resource_id; return v;
 end if;
 if (select count(*) from public.clinical_template_versions where tenant_id=profile.tenant_id and published_at>now()-interval '1 hour')>=30 then raise exception 'RATE_LIMIT' using errcode='54000'; end if;
 if p_template_id is null then
  if p_version is distinct from 0 then raise exception 'STALE_VERSION' using errcode='40001'; end if;
  if p_service_id is not null and not exists(select 1 from public.services where id=p_service_id and tenant_id=profile.tenant_id) then raise exception 'INVALID_REFERENCE' using errcode='22023'; end if;
  insert into public.clinical_templates(id,tenant_id,kind,title,service_id,current_version_id) values(target,profile.tenant_id,p_kind,btrim(p_title),p_service_id,revision_id) returning * into t;
 else
  select * into t from public.clinical_templates where id=p_template_id and tenant_id=profile.tenant_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  if t.version is distinct from p_version then raise exception 'STALE_VERSION' using errcode='40001'; end if;
  if t.kind<>p_kind or t.service_id is distinct from p_service_id then raise exception 'INVALID_TEMPLATE' using errcode='22023'; end if;
  update public.clinical_templates set title=btrim(p_title),current_revision=current_revision+1,current_version_id=revision_id,version=version+1 where id=t.id returning * into t;
 end if;
 insert into public.clinical_template_versions(id,tenant_id,template_id,revision,title,body,questions,content_hash,created_by)
 values(revision_id,profile.tenant_id,t.id,t.current_revision,btrim(p_title),btrim(p_body),p_questions,encode(extensions.digest(jsonb_build_array(p_kind,btrim(p_title),btrim(p_body),p_questions,p_service_id)::text,'sha256'),'hex'),auth.uid()) returning * into v;
 insert into app_private.idempotency_requests(actor_id,operation,request_key,request_hash,resource_id) values(auth.uid(),'clinical_template.publish',p_request_id,request_hash,v.id);
 return v;
end;
$$;

create function public.set_clinical_template_active(p_id uuid,p_version integer,p_active boolean) returns public.clinical_templates
language plpgsql security definer set search_path='' as $$
declare t public.clinical_templates;
begin
 if not app_private.is_owner() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into t from public.clinical_templates where id=p_id and tenant_id=app_private.current_tenant_id() for update;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 if t.version is distinct from p_version then raise exception 'STALE_VERSION' using errcode='40001'; end if;
 if p_active is null then raise exception 'INVALID_TEMPLATE' using errcode='22023'; end if;
 update public.clinical_templates set active=p_active,version=version+1 where id=p_id returning * into t; return t;
end;
$$;

create function public.save_pigment(p_request_id uuid,p_id uuid,p_version integer,p_brand text,p_name text,p_code text,p_active boolean)
returns public.pigments language plpgsql security definer set search_path='' as $$
declare t public.pigments; tenant uuid:=app_private.current_tenant_id(); request_hash text; previous app_private.idempotency_requests;
begin
 if not app_private.is_owner() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.tenants where id=tenant for update;
 if p_request_id is null or p_brand is null or char_length(btrim(p_brand)) not between 1 and 100 or p_name is null or char_length(btrim(p_name)) not between 1 and 100 or p_code is null or char_length(p_code)>100 or p_active is null then raise exception 'INVALID_PIGMENT' using errcode='22023'; end if;
 request_hash:=encode(extensions.digest(jsonb_build_array(p_id,p_version,p_brand,p_name,p_code,p_active)::text,'sha256'),'hex');
 select * into previous from app_private.idempotency_requests where actor_id=auth.uid() and operation='pigment.save' and request_key=p_request_id;
 if found then
  if previous.request_hash<>request_hash then raise exception 'IDEMPOTENCY_MISMATCH' using errcode='23505'; end if;
  select * into t from public.pigments where id=previous.resource_id; return t;
 end if;
 if p_id is null then
  if p_version is distinct from 0 then raise exception 'STALE_VERSION' using errcode='40001'; end if;
  insert into public.pigments(tenant_id,brand,name,code,active) values(tenant,btrim(p_brand),btrim(p_name),btrim(p_code),p_active) returning * into t;
 else
  select * into t from public.pigments where id=p_id and tenant_id=tenant for update;
  if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  if t.version is distinct from p_version then raise exception 'STALE_VERSION' using errcode='40001'; end if;
  update public.pigments set brand=btrim(p_brand),name=btrim(p_name),code=btrim(p_code),active=p_active,version=version+1 where id=p_id returning * into t;
 end if;
 insert into app_private.idempotency_requests(actor_id,operation,request_key,request_hash,resource_id) values(auth.uid(),'pigment.save',p_request_id,request_hash,t.id); return t;
end;
$$;

create function public.save_pigment_lot(p_request_id uuid,p_id uuid,p_version integer,p_pigment_id uuid,p_lot_number text,p_expires_on date,p_label_file_id uuid,p_label_text text,p_active boolean)
returns public.pigment_lots language plpgsql security definer set search_path='' as $$
declare t public.pigment_lots; tenant uuid:=app_private.current_tenant_id(); request_hash text; previous app_private.idempotency_requests;
begin
 if not app_private.is_owner() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.tenants where id=tenant for update;
 if p_request_id is null or p_lot_number is null or char_length(btrim(p_lot_number)) not between 1 and 100 or p_expires_on is null or p_label_text is null or char_length(p_label_text)>2000 or p_active is null then raise exception 'INVALID_LOT' using errcode='22023'; end if;
 request_hash:=encode(extensions.digest(jsonb_build_array(p_id,p_version,p_pigment_id,p_lot_number,p_expires_on,p_label_file_id,p_label_text,p_active)::text,'sha256'),'hex');
 select * into previous from app_private.idempotency_requests where actor_id=auth.uid() and operation='pigment_lot.save' and request_key=p_request_id;
 if found then
  if previous.request_hash<>request_hash then raise exception 'IDEMPOTENCY_MISMATCH' using errcode='23505'; end if;
  select * into t from public.pigment_lots where id=previous.resource_id; return t;
 end if;
 if not exists(select 1 from public.pigments where id=p_pigment_id and tenant_id=tenant) or not exists(select 1 from public.stored_files where id=p_label_file_id and tenant_id=tenant and pigment_id=p_pigment_id and kind='pigment_label' and state='ready') then raise exception 'INVALID_REFERENCE' using errcode='22023'; end if;
 if p_id is null then
  if p_version is distinct from 0 then raise exception 'STALE_VERSION' using errcode='40001'; end if;
  insert into public.pigment_lots(tenant_id,pigment_id,lot_number,expires_on,label_file_id,label_text,active) values(tenant,p_pigment_id,btrim(p_lot_number),p_expires_on,p_label_file_id,btrim(p_label_text),p_active) returning * into t;
 else
  select * into t from public.pigment_lots where id=p_id and tenant_id=tenant for update;
  if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  if t.version is distinct from p_version then raise exception 'STALE_VERSION' using errcode='40001'; end if;
  if t.pigment_id is distinct from p_pigment_id then raise exception 'INVALID_REFERENCE' using errcode='22023'; end if;
  update public.pigment_lots set lot_number=btrim(p_lot_number),expires_on=p_expires_on,label_file_id=p_label_file_id,label_text=btrim(p_label_text),active=p_active,version=version+1 where id=p_id returning * into t;
 end if;
 insert into app_private.idempotency_requests(actor_id,operation,request_key,request_hash,resource_id) values(auth.uid(),'pigment_lot.save',p_request_id,request_hash,t.id); return t;
end;
$$;

revoke all on function public.publish_clinical_template(uuid,uuid,integer,text,text,text,jsonb,uuid),public.set_clinical_template_active(uuid,integer,boolean),public.save_pigment(uuid,uuid,integer,text,text,text,boolean),public.save_pigment_lot(uuid,uuid,integer,uuid,text,date,uuid,text,boolean) from public,anon;
grant execute on function public.publish_clinical_template(uuid,uuid,integer,text,text,text,jsonb,uuid),public.set_clinical_template_active(uuid,integer,boolean),public.save_pigment(uuid,uuid,integer,text,text,text,boolean),public.save_pigment_lot(uuid,uuid,integer,uuid,text,date,uuid,text,boolean) to authenticated;
