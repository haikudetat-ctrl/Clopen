-- One P&L row per restaurant in an organization for a date range -- the
-- multi-unit rollup investors actually want to see. Authorization is
-- organization-scoped (not restaurant-scoped like the other gl_* functions)
-- since this deliberately spans every restaurant the caller's org owns;
-- it still reuses gl_pnl_summary per restaurant, which carries its own
-- is_same_org_restaurant + can_view_financials check, so a caller can never
-- see a restaurant outside their own organization even if this function's
-- own guard were somehow bypassed. Returns both dollar amounts and
-- percentages so a totals row can be a true weighted rollup rather than an
-- average of each restaurant's already-computed percentage.
create or replace function public.gl_restaurant_rollup(p_organization_id uuid, p_start_date date, p_end_date date)
returns table (
  restaurant_id uuid,
  restaurant_name text,
  location_name text,
  revenue numeric,
  cogs_amount numeric,
  cogs_pct numeric,
  prime_cost_amount numeric,
  prime_cost_pct numeric,
  operating_income numeric,
  operating_income_pct numeric
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  r record;
  pnl record;
  v_revenue numeric;
  v_cogs_amount numeric;
  v_prime_cost_amount numeric;
  v_operating_income numeric;
begin
  if not (public.current_organization_id() = p_organization_id and public.can_view_financials()) then
    raise exception 'not authorized to view the rollup for organization %', p_organization_id;
  end if;

  for r in
    select rr.id, rr.name, rr.location_name
    from public.restaurants rr
    where rr.organization_id = p_organization_id
    order by rr.name, rr.location_name
  loop
    v_revenue := 0;
    v_cogs_amount := 0;
    v_prime_cost_amount := 0;
    v_operating_income := 0;

    for pnl in
      select * from public.gl_pnl_summary(r.id, p_start_date, p_end_date)
    loop
      if pnl.line_item = 'Revenue' then
        v_revenue := pnl.amount;
      elsif pnl.line_item = 'COGS' then
        v_cogs_amount := pnl.amount;
      elsif pnl.line_item = 'Prime Cost' then
        v_prime_cost_amount := pnl.amount;
      elsif pnl.line_item = 'Operating Income' then
        v_operating_income := pnl.amount;
      end if;
    end loop;

    restaurant_id := r.id;
    restaurant_name := r.name;
    location_name := r.location_name;
    revenue := v_revenue;
    cogs_amount := v_cogs_amount;
    cogs_pct := case when v_revenue = 0 then null else round(v_cogs_amount / v_revenue * 100, 1) end;
    prime_cost_amount := v_prime_cost_amount;
    prime_cost_pct := case when v_revenue = 0 then null else round(v_prime_cost_amount / v_revenue * 100, 1) end;
    operating_income := v_operating_income;
    operating_income_pct := case when v_revenue = 0 then null else round(v_operating_income / v_revenue * 100, 1) end;
    return next;
  end loop;
end;
$function$;
