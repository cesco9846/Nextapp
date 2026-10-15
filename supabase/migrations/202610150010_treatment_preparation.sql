-- Draft anamnesis is kept out of the Data API. Reading requires an audited RPC.
create function public.read_treatment_preparation(p_appointment_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.appointments; c public.clients; p public.treatment_preparations; answers jsonb; consent jsonb; anamnesis jsonb; lots jsonb;
begin
 select * into a from public.appointments where id=p_appointment_id;
 if not found or not public.can_access_client_clinical(a.client_id) then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
 if (select count(*) from public.audit_log where tenant_id=a.tenant_id and actor_id=auth.uid() and action='anamnesis.read' and created_at>now()-interval '1 minute')>=60 then raise exception 'RATE_LIMIT' using errcode='54000'; end if;
 select * into c from public.clients where id=a.client_id;
 select * into p from public.treatment_preparations where appointment_id=a.id;
 insert into public.audit_log(tenant_id,actor_id,action,resource_type,resource_id) values(a.tenant_id,auth.uid(),'anamnesis.read','appointments',a.id);
 if p.id is not null then
  select x.answers into answers from app_private.preparation_answers x where x.preparation_id=p.id;
  select to_jsonb(v) into consent from public.clinical_template_versions v where id=p.consent_version_id;
  select to_jsonb(v) into anamnesis from public.clinical_template_versions v where id=p.anamnesis_version_id;
  select coalesce(jsonb_agg(jsonb_build_object('lot_id',lot_id,'snapshot',snapshot) order by id),'[]') into lots from public.treatment_lots where preparation_id=p.id;
 end if;
 return jsonb_build_object('appointment',jsonb_build_object('id',a.id,'client_id',a.client_id,'service_id',a.service_id,'service_name',a.service_name,'starts_at',a.starts_at,'ends_at',a.ends_at,'status',a.status,'version',a.version),
 'client',jsonb_build_object('id',c.id,'first_name',c.first_name,'last_name',c.last_name),
 'preparation',case when p.id is null then null else to_jsonb(p) end,'answers',coalesce(answers,'{}'),'consent',consent,'anamnesis',anamnesis,'lots',coalesce(lots,'[]'));
end;
$$;

create function public.save_treatment_preparation(p_request_id uuid,p_appointment_id uuid,p_appointment_version integer,p_version integer,p_consent_version_id uuid,p_anamnesis_version_id uuid,p_answers jsonb,p_lot_ids uuid[])
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
 select * into a from public.appointments where id=p_appointment_id for update;
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
  select * into label from public.stored_files where id=lot.label_file_id and state='ready' and kind='pigment_label' and pigment_id=pigment.id;
  if not found then raise exception 'INVALID_REFERENCE' using errcode='22023'; end if;
  insert into public.treatment_lots(tenant_id,preparation_id,lot_id,snapshot) values(tenant,p.id,lot.id,
   jsonb_build_object('brand',pigment.brand,'name',pigment.name,'code',pigment.code,'lot_number',lot.lot_number,'expires_on',lot.expires_on,'label_file_id',label.id,'label_sha256',label.sha256,'label_text',lot.label_text,'lot_version',lot.version,'pigment_version',pigment.version));
 end loop;
 insert into app_private.idempotency_requests(actor_id,operation,request_key,request_hash,resource_id) values(auth.uid(),'preparation.save',p_request_id,request_hash,p.id);
 return p;
end;
$$;
revoke all on function public.read_treatment_preparation(uuid),public.save_treatment_preparation(uuid,uuid,integer,integer,uuid,uuid,jsonb,uuid[]) from public,anon;
grant execute on function public.read_treatment_preparation(uuid),public.save_treatment_preparation(uuid,uuid,integer,integer,uuid,uuid,jsonb,uuid[]) to authenticated;
