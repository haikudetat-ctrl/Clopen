-- GL budgeting foundation, part 1: the 4-4-5 fiscal calendar.
-- Each fiscal year has 12 periods across 4 quarters; each quarter is
-- 13 weeks split 4-4-5, so period-over-period and week-over-week
-- comparisons are always apples to apples (unlike calendar months, which
-- have a varying number of weekends).
--
-- Scoped per organization (not global) since operators can start their
-- fiscal year on any date. Known limitation, documented rather than
-- silently handled: this generator produces exactly 52 weeks/year and does
-- not insert the occasional 53rd "leap week" some retail calendars use to
-- stay aligned to the actual calendar -- an operator who cares about that
-- alignment should just re-anchor a new fiscal year's start date when it
-- drifts enough to matter.

create table fiscal_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  fiscal_year integer not null,
  period_number integer not null check (period_number between 1 and 12),
  quarter integer not null check (quarter between 1 and 4),
  week_count integer not null check (week_count in (4, 5)),
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now(),
  unique (organization_id, fiscal_year, period_number),
  check (period_end > period_start)
);

create index fiscal_periods_organization_id_idx on fiscal_periods(organization_id);
create index fiscal_periods_date_range_idx on fiscal_periods(organization_id, period_start, period_end);

-- Generates the 12 periods for one fiscal year in the standard 4-4-5
-- weeks-per-quarter pattern, starting at p_start_date.
create or replace function generate_fiscal_periods(p_organization_id uuid, p_fiscal_year integer, p_start_date date)
returns setof fiscal_periods
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_period_start date := p_start_date;
  v_week_counts integer[] := array[4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 5];
  v_period_number integer;
  v_quarter integer;
  v_week_count integer;
  v_period_end date;
begin
  if exists (select 1 from public.fiscal_periods where organization_id = p_organization_id and fiscal_year = p_fiscal_year) then
    raise exception 'fiscal_year % already has periods for organization %', p_fiscal_year, p_organization_id;
  end if;

  for v_period_number in 1..12 loop
    v_week_count := v_week_counts[v_period_number];
    v_quarter := ceil(v_period_number::numeric / 3);
    v_period_end := v_period_start + (v_week_count * 7 - 1);

    insert into public.fiscal_periods (
      organization_id, fiscal_year, period_number, quarter, week_count, period_start, period_end
    ) values (
      p_organization_id, p_fiscal_year, v_period_number, v_quarter, v_week_count, v_period_start, v_period_end
    );

    v_period_start := v_period_end + 1;
  end loop;

  return query
    select * from public.fiscal_periods
    where organization_id = p_organization_id and fiscal_year = p_fiscal_year
    order by period_number;
end;
$$;
