-- An absent label is valid; a supplied label must still be verified and tenant-scoped.
alter table public.pigment_lots alter column label_file_id drop not null;

create or replace function public.save_pigment_lot(p_request_id uuid,p_id uuid,p_version integer,p_pigment_id uuid,p_lot_number text,p_expires_on date,p_label_file_id uuid,p_label_text text,p_active boolean)
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
 if not exists(select 1 from public.pigments where id=p_pigment_id and tenant_id=tenant) or (p_label_file_id is not null and not exists(select 1 from public.stored_files where id=p_label_file_id and tenant_id=tenant and pigment_id=p_pigment_id and kind='pigment_label' and state='ready')) then raise exception 'INVALID_REFERENCE' using errcode='22023'; end if;
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


create or replace function public.save_treatment_preparation(p_request_id uuid,p_appointment_id uuid,p_appointment_version integer,p_version integer,p_consent_version_id uuid,p_anamnesis_version_id uuid,p_answers jsonb,p_lot_ids uuid[])
returns public.treatment_preparations language plpgsql security definer set search_path='' as $$
declare a public.appointments; p public.treatment_preparations; tenant uuid:=app_private.current_tenant_id();
 consent public.clinical_template_versions; anam public.clinical_template_versions; q jsonb; entry record; ids text[]:='{}';
 lot public.pigment_lots; pigment public.pigments; old_snapshot jsonb; label public.stored_files; today date; treatment_day date;
 request_hash text; previous app_private.idempotency_requests;
begin
 select * into a from public.appointments where id=p_appointment_id;
 if not found or not public.can_access_client_clinical(a.client_id) then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 -- Same order as scheduling/team writes: tenant before appointment/preparation.
 perform 1 from public.tenants where id=tenant for update;
 select * into a from public.appointments where id=p_appointment_id and tenant_id=tenant for update;
 if not found or not public.can_access_client_clinical(a.client_id) then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 if p_request_id is null or p_answers is null or jsonb_typeof(p_answers)<>'object' or p_lot_ids is null or cardinality(p_lot_ids)>12 or cardinality(p_lot_ids)<>(select count(distinct v) from unnest(p_lot_ids) v) then raise exception 'INVALID_PREPARATION' using errcode='22023'; end if;
 request_hash:=encode(extensions.digest(jsonb_build_array(p_appointment_id,p_appointment_version,p_version,p_consent_version_id,p_anamnesis_version_id,p_answers,p_lot_ids)::text,'sha256'),'hex');
 select * into previous from app_private.idempotency_requests where actor_id=auth.uid() and operation='preparation.save' and request_key=p_request_id;
 if found then
  if previous.request_hash<>request_hash then raise exception 'IDEMPOTENCY_MISMATCH' using errcode='23505'; end if;
  select * into p from public.treatment_preparations where id=previous.resource_id; return p;
 end if;
 if a.version is distinct from p_appointment_version then raise exception 'STALE_VERSION' using errcode='40001'; end if;
 if a.status not in('booked','confirmed') or exists(select 1 from public.clients where id=a.client_id and archived_at is not null) then raise exception 'TERMINAL_APPOINTMENT' using errcode='22023'; end if;
 select * into p from public.treatment_preparations where appointment_id=a.id for update;
 if coalesce(p.version,0) is distinct from p_version then raise exception 'STALE_VERSION' using errcode='40001'; end if;
 select v.* into consent from public.clinical_template_versions v join public.clinical_templates t on t.id=v.template_id
 where v.id=p_consent_version_id and v.tenant_id=tenant and t.kind='consent' and (t.service_id is null or t.service_id=a.service_id)
 and ((t.active and t.current_version_id=v.id) or p.consent_version_id=v.id);
 if not found then raise exception 'INVALID_TEMPLATE' using errcode='22023'; end if;
 if p_anamnesis_version_id is not null then
  select v.* into anam from public.clinical_template_versions v join public.clinical_templates t on t.id=v.template_id
  where v.id=p_anamnesis_version_id and v.tenant_id=tenant and t.kind='anamnesis' and (t.service_id is null or t.service_id=a.service_id)
  and ((t.active and t.current_version_id=v.id) or p.anamnesis_version_id=v.id);
  if not found then raise exception 'INVALID_TEMPLATE' using errcode='22023'; end if;
 end if;
 if anam.id is not null then
  for q in select value from jsonb_array_elements(anam.questions) loop ids:=array_append(ids,q->>'id'); end loop;
 end if;
 for entry in select key,value from jsonb_each(p_answers) loop
  if not(entry.key=any(ids)) then raise exception 'INVALID_ANSWERS' using errcode='22023'; end if;
  select value into q from jsonb_array_elements(anam.questions) where value->>'id'=entry.key;
  if ((q->>'type')='yes_no' and jsonb_typeof(entry.value)<>'boolean') or
   ((q->>'type')='text' and (jsonb_typeof(entry.value)<>'string' or char_length(entry.value#>>'{}')>500)) then raise exception 'INVALID_ANSWERS' using errcode='22023'; end if;
 end loop;
 today:=(now() at time zone (select timezone from public.tenants where id=tenant))::date;
 treatment_day:=(a.starts_at at time zone (select timezone from public.tenants where id=tenant))::date;
 -- Validate every selection before changing the preparation. Previously chosen
 -- label/lot snapshots remain unchanged; only explicit new selections snapshot.
 for lot in select * from public.pigment_lots where id=any(p_lot_ids) and tenant_id=tenant loop
  select * into pigment from public.pigments where id=lot.pigment_id;
  if not lot.active or not pigment.active or lot.expires_on<greatest(today,treatment_day) then raise exception 'LOT_UNAVAILABLE' using errcode='22023'; end if;
 end loop;
 if (select count(*) from public.pigment_lots where id=any(p_lot_ids) and tenant_id=tenant)<>cardinality(p_lot_ids) then raise exception 'INVALID_REFERENCE' using errcode='22023'; end if;
 if p.id is null then
  insert into public.treatment_preparations(tenant_id,appointment_id,client_id,consent_version_id,anamnesis_version_id,appointment_version,created_by,updated_by)
  values(tenant,a.id,a.client_id,consent.id,anam.id,a.version,auth.uid(),auth.uid()) returning * into p;
 else
  update public.treatment_preparations set consent_version_id=consent.id,anamnesis_version_id=anam.id,appointment_version=a.version,version=version+1,updated_at=now(),updated_by=auth.uid() where id=p.id returning * into p;
 end if;
 insert into app_private.preparation_answers(preparation_id,answers) values(p.id,p_answers) on conflict(preparation_id) do update set answers=excluded.answers;
 delete from public.treatment_lots where preparation_id=p.id and not(lot_id=any(p_lot_ids));
 for lot in select * from public.pigment_lots where id=any(p_lot_ids) and tenant_id=tenant loop
  if exists(select 1 from public.treatment_lots where preparation_id=p.id and lot_id=lot.id) then continue; end if;
  select * into pigment from public.pigments where id=lot.pigment_id;
  label:=null;
  if lot.label_file_id is not null then
   select * into label from public.stored_files where id=lot.label_file_id and tenant_id=tenant and state='ready' and kind='pigment_label' and pigment_id=pigment.id;
   if not found then raise exception 'INVALID_REFERENCE' using errcode='22023'; end if;
  end if;
  insert into public.treatment_lots(tenant_id,preparation_id,lot_id,snapshot) values(tenant,p.id,lot.id,
   jsonb_build_object('brand',pigment.brand,'name',pigment.name,'code',pigment.code,'lot_number',lot.lot_number,'expires_on',lot.expires_on,'label_file_id',label.id,'label_sha256',label.sha256,'label_text',lot.label_text,'lot_version',lot.version,'pigment_version',pigment.version));
 end loop;
 insert into app_private.idempotency_requests(actor_id,operation,request_key,request_hash,resource_id) values(auth.uid(),'preparation.save',p_request_id,request_hash,p.id);
 return p;
end;
$$;
