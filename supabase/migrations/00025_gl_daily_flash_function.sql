-- Daily flash report: net sales vs. scheduled labor cost, day by day.
-- Labor is derived from schedule_assignments + shift_templates (hourly)
-- plus amortized annual_salary/365 for salaried staff active that day --
-- there is no time-clock/punch data in this schema, so this is explicitly
-- a scheduled-labor proxy, not actual clocked hours.
create or replace function public.gl_daily_flash(p_restaurant_id uuid, p_start_date date, p_end_date date)
returns table (
  sales_date date,
  net_sales numeric,
  labor_cost numeric,
  labor_pct numeric
)
language sql
stable
security definer
set search_path to ''
as $function$
  with authorized as (
    select public.is_same_org_restaurant(p_restaurant_id) and public.can_view_financials() as ok
  ),
  days as (
    select generate_series(p_start_date, p_end_date, interval '1 day')::date as d
  ),
  sales as (
    select ds.sales_date as d,
      sum(coalesce(ds.net_amount, ds.gross_amount - ds.discounts - ds.comps)) as net_sales
    from public.daily_sales ds
    where ds.restaurant_id = p_restaurant_id
      and ds.sales_date between p_start_date and p_end_date
      and (select ok from authorized)
    group by ds.sales_date
  ),
  shifts as (
    select
      sa.staff_id,
      (s.week_start + sa.day) as shift_date,
      extract(epoch from (
        case when st.end_time <= st.start_time then st.end_time + interval '1 day' else st.end_time end
      ) - st.start_time) / 3600.0 as hours
    from public.schedule_assignments sa
    join public.schedules s on s.id = sa.schedule_id
    join public.shift_templates st on st.id = sa.template_id
    where s.restaurant_id = p_restaurant_id
      and sa.staff_id is not null
      and (s.week_start + sa.day) between p_start_date and p_end_date
      and (select ok from authorized)
  ),
  hourly_cost as (
    select sh.shift_date as d, sum(sh.hours * sch.hourly_rate) as amount
    from shifts sh
    join public.staff_compensation_history sch
      on sch.staff_id = sh.staff_id
      and sch.compensation_type = 'hourly'
      and sch.effective_date <= sh.shift_date
      and (sch.end_date is null or sch.end_date >= sh.shift_date)
    group by sh.shift_date
  ),
  salary_cost as (
    select d.d, sum(sch.annual_salary / 365.0) as amount
    from days d
    join public.staff_compensation_history sch on true
    join public.staff st2 on st2.id = sch.staff_id
    where st2.restaurant_id = p_restaurant_id
      and sch.compensation_type = 'salary'
      and sch.effective_date <= d.d
      and (sch.end_date is null or sch.end_date >= d.d)
      and (select ok from authorized)
    group by d.d
  ),
  labor as (
    select d.d, coalesce(hc.amount, 0) + coalesce(sc.amount, 0) as amount
    from days d
    left join hourly_cost hc on hc.d = d.d
    left join salary_cost sc on sc.d = d.d
  )
  select
    d.d as sales_date,
    coalesce(s.net_sales, 0) as net_sales,
    coalesce(l.amount, 0) as labor_cost,
    case
      when coalesce(s.net_sales, 0) = 0 then null
      else round(coalesce(l.amount, 0) / s.net_sales * 100, 1)
    end as labor_pct
  from days d
  left join sales s on s.d = d.d
  left join labor l on l.d = d.d
  order by d.d;
$function$;
