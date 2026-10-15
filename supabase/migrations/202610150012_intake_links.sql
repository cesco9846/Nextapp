-- Limited capability for client intake. No ordinary role can read token hashes,
-- receipt payload hashes or answers. The public gateway returns typed failures
-- so rejected attempts still commit their rate-limit counters.
alter table public.treatment_preparations alter column updated_by drop not null;
alter table public.treatment_preparations add unique(tenant_id,id,appointment_id);
create table public.intake_links (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 appointment_id uuid not null, preparation_id uuid not null,
 appointment_version integer not null check(appointment_version>0), preparation_version integer not null check(preparation_version>0),
 mode text not null check(mode in('link','tablet')), purpose text not null default 'intake' check(purpose='intake'),
 created_by uuid not null, request_id uuid not null, created_at timestamptz not null default now(),
 expires_at timestamptz not null, revoked_at timestamptz, used_at timestamptz,
 version integer not null default 1 check(version>0), unique(tenant_id,id), unique(created_by,request_id),
 check(expires_at>created_at),
 foreign key(tenant_id,preparation_id,appointment_id) references public.treatment_preparations(tenant_id,id,appointment_id),
 foreign key(tenant_id,created_by) references public.users(tenant_id,id)
);
create unique index one_open_intake_link on public.intake_links(preparation_id,mode) where revoked_at is null and used_at is null;
create index intake_links_appointment on public.intake_links(tenant_id,appointment_id,created_at desc,id);
alter table public.intake_links enable row level security;
create policy intake_metadata_read on public.intake_links for select to authenticated using(exists(
 select 1 from public.treatment_preparations p where p.id=preparation_id and public.can_access_client_clinical(p.client_id)
));
revoke all on public.intake_links from public,anon,authenticated;
grant select on public.intake_links to authenticated;
create trigger audit_intake_links after insert or update on public.intake_links for each row execute function app_private.audit_mutation();

create table app_private.intake_capabilities (
 link_id uuid primary key references public.intake_links(id), token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$')
);
create table app_private.intake_receipts (
 link_id uuid primary key references public.intake_links(id), request_id uuid not null,
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'), receipt_id uuid not null unique default gen_random_uuid(),
 submitted_at timestamptz not null default now()
);
create table app_private.intake_rate_limits (
 key text not null, window_start timestamptz not null, attempts integer not null check(attempts>0), primary key(key,window_start)
);
alter table app_private.intake_capabilities enable row level security;
alter table app_private.intake_receipts enable row level security;
alter table app_private.intake_rate_limits enable row level security;
revoke all on app_private.intake_capabilities,app_private.intake_receipts,app_private.intake_rate_limits from public,anon,authenticated;

create function public.create_intake_link(p_request_id uuid,p_appointment_id uuid,p_appointment_version integer,p_preparation_version integer,p_mode text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=app_private.current_tenant_id(); a public.appointments; p public.treatment_preparations; l public.intake_links; token text; expiry timestamptz;
begin
 perform 1 from public.tenants where id=tenant for update;
 select * into a from public.appointments where id=p_appointment_id and tenant_id=tenant for update;
 if not found or not public.can_access_client_clinical(a.client_id) then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 if p_request_id is null or p_mode is null or p_mode not in('link','tablet') then raise exception 'INVALID_INTAKE' using errcode='22023'; end if;
 select * into l from public.intake_links where created_by=auth.uid() and request_id=p_request_id;
 if found then
  if l.appointment_id<>p_appointment_id or l.appointment_version is distinct from p_appointment_version or l.preparation_version is distinct from p_preparation_version or l.mode<>p_mode then
   raise exception 'IDEMPOTENCY_MISMATCH' using errcode='23505';
  end if;
  return jsonb_build_object('link',to_jsonb(l),'token',null);
 end if;
 if a.version is distinct from p_appointment_version then raise exception 'STALE_VERSION' using errcode='40001'; end if;
 if a.status not in('booked','confirmed') or a.ends_at<=clock_timestamp() or exists(select 1 from public.clients where id=a.client_id and archived_at is not null) then raise exception 'TERMINAL_APPOINTMENT' using errcode='22023'; end if;
 select * into p from public.treatment_preparations where appointment_id=a.id for update;
 if not found then raise exception 'PREPARATION_REQUIRED' using errcode='22023'; end if;
 if p.version is distinct from p_preparation_version or p.appointment_version<>a.version then raise exception 'STALE_VERSION' using errcode='40001'; end if;
 if p.status<>'draft' then raise exception 'INVALID_INTAKE' using errcode='22023'; end if;
 if (select count(*) from public.intake_links where tenant_id=tenant and created_at>clock_timestamp()-interval '1 hour')>=60 then raise exception 'RATE_LIMIT' using errcode='54000'; end if;
 expiry:=least(a.ends_at,clock_timestamp()+case when p_mode='tablet' then interval '30 minutes' else interval '24 hours' end);
 update public.intake_links set revoked_at=clock_timestamp(),version=version+1 where preparation_id=p.id and mode=p_mode and revoked_at is null and used_at is null;
 insert into public.intake_links(tenant_id,appointment_id,preparation_id,appointment_version,preparation_version,mode,created_by,request_id,expires_at)
 values(tenant,a.id,p.id,a.version,p.version,p_mode,auth.uid(),p_request_id,expiry) returning * into l;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into app_private.intake_capabilities(link_id,token_hash) values(l.id,encode(extensions.digest(token,'sha256'),'hex'));
 return jsonb_build_object('link',to_jsonb(l),'token',token);
end;
$$;
create function public.revoke_intake_link(p_id uuid,p_version integer) returns public.intake_links
language plpgsql security definer set search_path='' as $$
declare tenant uuid:=app_private.current_tenant_id(); l public.intake_links; client uuid;
begin
 perform 1 from public.tenants where id=tenant for update;
 select * into l from public.intake_links where id=p_id and tenant_id=tenant for update;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 select client_id into client from public.treatment_preparations where id=l.preparation_id;
 if not public.can_access_client_clinical(client) then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 if l.version is distinct from p_version then raise exception 'STALE_VERSION' using errcode='40001'; end if;
 if l.revoked_at is null then update public.intake_links set revoked_at=clock_timestamp(),version=version+1 where id=l.id returning * into l; end if;
 return l;
end;
$$;
revoke all on function public.create_intake_link(uuid,uuid,integer,integer,text),public.revoke_intake_link(uuid,integer) from public,anon;
grant execute on function public.create_intake_link(uuid,uuid,integer,integer,text),public.revoke_intake_link(uuid,integer) to authenticated;

create function public.use_intake_link(p_token_hash text,p_action text,p_request_id uuid,p_answers jsonb,p_confirm_read boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare bucket_start timestamptz:=date_trunc('minute',clock_timestamp()); attempts integer;
 l public.intake_links; a public.appointments; p public.treatment_preparations; c public.clients; issuer public.users;
 consent public.clinical_template_versions; anam public.clinical_template_versions; receipt app_private.intake_receipts;
 q jsonb; entry record; ids text[]:='{}'; request_hash text;
 denied constant jsonb:='{"ok":false,"status":410,"code":"INTAKE_UNAVAILABLE"}';
 invalid constant jsonb:='{"ok":false,"status":422,"code":"INTAKE_ANSWERS"}';
begin
 insert into app_private.intake_rate_limits(key,window_start,attempts) values('global',bucket_start,1)
 on conflict(key,window_start) do update set attempts=app_private.intake_rate_limits.attempts+1 returning intake_rate_limits.attempts into attempts;
 delete from app_private.intake_rate_limits where window_start<bucket_start-interval '1 hour';
 if attempts>300 then return jsonb_build_object('ok',false,'status',429,'code','RATE_LIMIT'); end if;
 if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then return denied; end if;
 insert into app_private.intake_rate_limits(key,window_start,attempts) values(p_token_hash,bucket_start,1)
 on conflict(key,window_start) do update set attempts=app_private.intake_rate_limits.attempts+1 returning intake_rate_limits.attempts into attempts;
 if attempts>20 then return jsonb_build_object('ok',false,'status',429,'code','RATE_LIMIT'); end if;
 if p_action is null or p_action not in('read','submit') then return jsonb_build_object('ok',false,'status',400,'code','INVALID_INTAKE'); end if;
 select i.* into l from public.intake_links i join app_private.intake_capabilities cap on cap.link_id=i.id where cap.token_hash=p_token_hash;
 if not found then return denied; end if;
 -- Same tenant lock as scheduling, preparation changes, revocation and suspension.
 perform 1 from public.tenants where id=l.tenant_id for update;
 select * into a from public.appointments where id=l.appointment_id for update;
 select * into l from public.intake_links where id=l.id for update;
 select * into p from public.treatment_preparations where id=l.preparation_id for update;
 select * into c from public.clients where id=p.client_id;
 select * into issuer from public.users where id=l.created_by;
 if l.revoked_at is not null or l.expires_at<=clock_timestamp() or a.status not in('booked','confirmed') or a.ends_at<=clock_timestamp()
 or c.archived_at is not null or not issuer.active or issuer.tenant_id<>l.tenant_id
 or (issuer.role<>'owner' and (not issuer.clinical_access or not exists(select 1 from public.client_assignments ca where ca.client_id=c.id and ca.operator_id=issuer.id and ca.active))) then return denied; end if;
 request_hash:=encode(extensions.digest(jsonb_build_array(p_answers,p_confirm_read)::text,'sha256'),'hex');
 if l.used_at is not null then
  select * into receipt from app_private.intake_receipts where link_id=l.id;
  if p_action='submit' and receipt.request_id=p_request_id and receipt.payload_hash=request_hash then
   return jsonb_build_object('ok',true,'receipt',jsonb_build_object('id',receipt.receipt_id,'submitted_at',receipt.submitted_at));
  end if;
  return denied;
 end if;
 if a.version<>l.appointment_version or p.version<>l.preparation_version or p.appointment_version<>a.version or p.status<>'draft' then return denied; end if;
 select * into consent from public.clinical_template_versions where id=p.consent_version_id;
 select * into anam from public.clinical_template_versions where id=p.anamnesis_version_id;
 if p_action='read' then
  insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(l.tenant_id,null,'intake.read','intake_links',l.id);
  return jsonb_build_object('ok',true,'context',jsonb_build_object('mode',l.mode,'expires_at',l.expires_at,
   'studio',(select name from public.tenants where id=l.tenant_id),'timezone',(select timezone from public.tenants where id=l.tenant_id),
   'first_name',c.first_name,'service_name',a.service_name,'starts_at',a.starts_at,
   'consent',jsonb_build_object('id',consent.id,'revision',consent.revision,'title',consent.title,'body',consent.body),
   'anamnesis',case when anam.id is null then null else jsonb_build_object('id',anam.id,'revision',anam.revision,'title',anam.title,'body',anam.body,'questions',anam.questions) end));
 end if;
 if p_request_id is null or p_confirm_read is distinct from true or p_answers is null or jsonb_typeof(p_answers)<>'object' then return invalid; end if;
 if anam.id is not null then
  for q in select value from jsonb_array_elements(anam.questions) loop
   ids:=array_append(ids,q->>'id');
   if (q->>'required')::boolean and (not(p_answers ? (q->>'id')) or (q->>'type'='text' and btrim(p_answers->>(q->>'id'))='')) then return invalid; end if;
  end loop;
 end if;
 for entry in select key,value from jsonb_each(p_answers) loop
  if not(entry.key=any(ids)) then return invalid; end if;
  select value into q from jsonb_array_elements(anam.questions) where value->>'id'=entry.key;
  if (q->>'type'='yes_no' and jsonb_typeof(entry.value)<>'boolean') or (q->>'type'='text' and (jsonb_typeof(entry.value)<>'string' or char_length(entry.value#>>'{}')>500)) then return invalid; end if;
 end loop;
 -- Version update, answers, receipt, audit and token consumption commit together.
 update public.treatment_preparations set version=version+1,updated_at=clock_timestamp(),updated_by=null where id=p.id;
 insert into app_private.preparation_answers(preparation_id,answers) values(p.id,p_answers) on conflict(preparation_id) do update set answers=excluded.answers;
 insert into app_private.intake_receipts(link_id,request_id,payload_hash) values(l.id,p_request_id,request_hash) returning * into receipt;
 update public.intake_links set used_at=receipt.submitted_at,version=version+1 where id=l.id;
 -- Invalidate every other open capability for the previous preparation revision.
 update public.intake_links set revoked_at=clock_timestamp(),version=version+1 where preparation_id=p.id and id<>l.id and revoked_at is null and used_at is null;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(l.tenant_id,null,'intake.submitted','intake_links',l.id);
 return jsonb_build_object('ok',true,'receipt',jsonb_build_object('id',receipt.receipt_id,'submitted_at',receipt.submitted_at));
end;
$$;
revoke all on function public.use_intake_link(text,text,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.use_intake_link(text,text,uuid,jsonb,boolean) to service_role;
