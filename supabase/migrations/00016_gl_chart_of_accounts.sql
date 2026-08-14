-- GL budgeting foundation, part 2: chart of accounts, and mapping existing
-- cost data onto it.
--
-- Every account belongs to one of the classic restaurant P&L buckets
-- (account_type), which is what lets gl_pnl_summary() (built later) roll
-- individual GL codes up into Revenue / COGS / Gross Profit / Labor /
-- Prime Cost / Occupancy / G&A / Operating Income -- the actual story, not
-- just a list of numbers.

create table gl_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name text not null,
  account_type text not null check (account_type in (
    'revenue', 'cogs', 'labor', 'controllable', 'occupancy', 'g_and_a', 'other'
  )),
  parent_account_id uuid references gl_accounts(id) on delete set null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create index gl_accounts_organization_id_idx on gl_accounts(organization_id);
create index gl_accounts_parent_account_id_idx on gl_accounts(parent_account_id);

-- A parent account must be in the same org and share the same account_type
-- as its children -- otherwise "roll COGS children up to the COGS parent"
-- silently breaks the moment someone mis-parents an account.
create or replace function validate_gl_account_parent()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_parent_org uuid;
  v_parent_type text;
begin
  if new.parent_account_id is null then
    return new;
  end if;

  select organization_id, account_type into v_parent_org, v_parent_type
  from public.gl_accounts where id = new.parent_account_id;

  if v_parent_org is null then
    raise exception 'parent_account_id % not found', new.parent_account_id;
  end if;

  if v_parent_org <> new.organization_id then
    raise exception 'gl_account and its parent_account must belong to the same organization';
  end if;

  if v_parent_type <> new.account_type then
    raise exception 'gl_account (%) and its parent_account (%) must share the same account_type', new.account_type, v_parent_type;
  end if;

  return new;
end;
$$;

create trigger validate_gl_account_parent_trigger
  before insert or update of parent_account_id, account_type, organization_id on gl_accounts
  for each row execute function validate_gl_account_parent();

-- Seeds a standard restaurant chart of accounts for an organization.
-- Codes/structure are a reasonable default -- rename or add accounts
-- afterward via normal inserts/updates, this is just a starting point.
create or replace function seed_standard_coa(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_revenue uuid;
  v_cogs uuid;
  v_labor uuid;
  v_controllable uuid;
  v_occupancy uuid;
  v_g_and_a uuid;
begin
  if exists (select 1 from public.gl_accounts where organization_id = p_organization_id) then
    raise exception 'organization % already has gl_accounts', p_organization_id;
  end if;

  insert into public.gl_accounts (organization_id, code, name, account_type, sort_order) values
    (p_organization_id, '4000', 'Total revenue', 'revenue', 100)
    returning id into v_revenue;
  insert into public.gl_accounts (organization_id, code, name, account_type, parent_account_id, sort_order) values
    (p_organization_id, '4010', 'Food sales', 'revenue', v_revenue, 110),
    (p_organization_id, '4020', 'N/A beverage sales', 'revenue', v_revenue, 120),
    (p_organization_id, '4030', 'Liquor sales', 'revenue', v_revenue, 130),
    (p_organization_id, '4040', 'Beer & wine sales', 'revenue', v_revenue, 140),
    (p_organization_id, '4090', 'Other revenue', 'revenue', v_revenue, 190);

  insert into public.gl_accounts (organization_id, code, name, account_type, sort_order) values
    (p_organization_id, '5000', 'Total cost of goods sold', 'cogs', 200)
    returning id into v_cogs;
  insert into public.gl_accounts (organization_id, code, name, account_type, parent_account_id, sort_order) values
    (p_organization_id, '5010', 'Food cost', 'cogs', v_cogs, 210),
    (p_organization_id, '5020', 'N/A beverage cost', 'cogs', v_cogs, 220),
    (p_organization_id, '5030', 'Liquor cost', 'cogs', v_cogs, 230),
    (p_organization_id, '5040', 'Beer & wine cost', 'cogs', v_cogs, 240);

  insert into public.gl_accounts (organization_id, code, name, account_type, sort_order) values
    (p_organization_id, '6000', 'Total labor', 'labor', 300)
    returning id into v_labor;
  insert into public.gl_accounts (organization_id, code, name, account_type, parent_account_id, sort_order) values
    (p_organization_id, '6010', 'Hourly wages - FOH', 'labor', v_labor, 310),
    (p_organization_id, '6020', 'Hourly wages - BOH', 'labor', v_labor, 320),
    (p_organization_id, '6030', 'Management salaries', 'labor', v_labor, 330),
    (p_organization_id, '6040', 'Payroll taxes', 'labor', v_labor, 340),
    (p_organization_id, '6050', 'Employee benefits', 'labor', v_labor, 350);

  insert into public.gl_accounts (organization_id, code, name, account_type, sort_order) values
    (p_organization_id, '7000', 'Total controllable expenses', 'controllable', 400)
    returning id into v_controllable;
  insert into public.gl_accounts (organization_id, code, name, account_type, parent_account_id, sort_order) values
    (p_organization_id, '7010', 'Restaurant supplies', 'controllable', v_controllable, 410),
    (p_organization_id, '7020', 'Smallwares', 'controllable', v_controllable, 420),
    (p_organization_id, '7030', 'Repairs & maintenance', 'controllable', v_controllable, 430),
    (p_organization_id, '7040', 'Marketing & advertising', 'controllable', v_controllable, 440),
    (p_organization_id, '7050', 'Credit card fees', 'controllable', v_controllable, 450),
    (p_organization_id, '7060', 'Uniforms & laundry', 'controllable', v_controllable, 460);

  insert into public.gl_accounts (organization_id, code, name, account_type, sort_order) values
    (p_organization_id, '8000', 'Total occupancy', 'occupancy', 500)
    returning id into v_occupancy;
  insert into public.gl_accounts (organization_id, code, name, account_type, parent_account_id, sort_order) values
    (p_organization_id, '8010', 'Rent', 'occupancy', v_occupancy, 510),
    (p_organization_id, '8020', 'Utilities', 'occupancy', v_occupancy, 520),
    (p_organization_id, '8030', 'Property tax', 'occupancy', v_occupancy, 530),
    (p_organization_id, '8040', 'Insurance', 'occupancy', v_occupancy, 540);

  insert into public.gl_accounts (organization_id, code, name, account_type, sort_order) values
    (p_organization_id, '9000', 'Total general & administrative', 'g_and_a', 600)
    returning id into v_g_and_a;
  insert into public.gl_accounts (organization_id, code, name, account_type, parent_account_id, sort_order) values
    (p_organization_id, '9010', 'Office supplies', 'g_and_a', v_g_and_a, 610),
    (p_organization_id, '9020', 'Professional fees', 'g_and_a', v_g_and_a, 620),
    (p_organization_id, '9030', 'Bank charges', 'g_and_a', v_g_and_a, 630),
    (p_organization_id, '9090', 'Other expenses', 'g_and_a', v_g_and_a, 690);
end;
$$;

-- Maps an inventory category (Produce, Liquor, etc.) to the COGS account
-- its items' usage should roll up to. This is the join path gl_actual_cogs()
-- uses later: stock ledger -> inventory_items -> inventory_categories -> gl_account.
alter table inventory_categories add column gl_account_id uuid references gl_accounts(id);

-- Non-inventory AP spend (rent, utilities, marketing, professional fees)
-- never touches inventory_items, so invoice_lines needs to support a line
-- tagged directly to a GL account instead of an inventory item.
alter table invoice_lines alter column inventory_item_id drop not null;
alter table invoice_lines add column gl_account_id uuid references gl_accounts(id);
alter table invoice_lines add constraint invoice_lines_item_or_gl_account
  check (num_nonnulls(inventory_item_id, gl_account_id) = 1);

-- Replaces the old trigger: quantity_base_unit only applies when the line
-- is an inventory item; a direct GL expense line (e.g. "Rent, $4,500") has
-- no natural unit conversion and doesn't need one.
create or replace function invoice_line_before_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  select restaurant_id into new.restaurant_id
  from public.invoices where id = new.invoice_id;

  if new.inventory_item_id is not null then
    new.quantity_base_unit := public.to_base_unit_quantity(new.inventory_item_id, new.quantity, new.unit_id);
  end if;

  new.line_total := new.quantity * new.unit_cost;

  return new;
end;
$$;

-- Replaces the generic same-org trigger for this table: validate whichever
-- of inventory_item_id / gl_account_id is set against the line's restaurant.
create or replace function validate_invoice_line_org()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_restaurant_org uuid;
  v_item_org uuid;
  v_gl_org uuid;
begin
  select organization_id into v_restaurant_org from public.restaurants where id = new.restaurant_id;

  if new.inventory_item_id is not null then
    select organization_id into v_item_org from public.inventory_items where id = new.inventory_item_id;
    if v_item_org is null or v_item_org <> v_restaurant_org then
      raise exception 'inventory_item % does not belong to the same organization as restaurant %', new.inventory_item_id, new.restaurant_id;
    end if;
  else
    select organization_id into v_gl_org from public.gl_accounts where id = new.gl_account_id;
    if v_gl_org is null or v_gl_org <> v_restaurant_org then
      raise exception 'gl_account % does not belong to the same organization as restaurant %', new.gl_account_id, new.restaurant_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_invoice_line_same_org on invoice_lines;
create trigger validate_invoice_line_org_trigger
  before insert on invoice_lines
  for each row execute function validate_invoice_line_org();
