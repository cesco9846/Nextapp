create function public.completed_report(p_year integer default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare profile public.users; tz text; selected_year integer; result jsonb;
begin
  select * into profile from public.users where id=auth.uid() and active;
  if not found or profile.role<>'owner' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select timezone into tz from public.tenants where id=profile.tenant_id;
  selected_year:=coalesce(p_year,extract(year from now() at time zone tz)::integer);
  if selected_year<1900 or selected_year>2200 then raise exception 'INVALID_YEAR' using errcode='22023'; end if;
  select jsonb_build_object(
    'year',selected_year,
    'years',(select jsonb_agg(y order by y desc) from (
      select distinct extract(year from starts_at at time zone tz)::integer as y from public.appointments
      where tenant_id=profile.tenant_id and status='completed' and starts_at<=now()
      union select extract(year from now() at time zone tz)::integer
      union select selected_year
    ) years),
    'months',(select jsonb_agg(jsonb_build_object('month',m,'count',coalesce(a.count,0),'value_cents',coalesce(a.value_cents,0)) order by m)
      from generate_series(1,12) m left join (
        select extract(month from starts_at at time zone tz)::integer as month,count(*) as count,sum(price_cents) as value_cents
        from public.appointments where tenant_id=profile.tenant_id and status='completed' and starts_at<=now()
          and extract(year from starts_at at time zone tz)=selected_year
        group by 1
      ) a on a.month=m)
  ) into result;
  return result;
end;
$$;
revoke all on function public.completed_report(integer) from public,anon;
grant execute on function public.completed_report(integer) to authenticated;
