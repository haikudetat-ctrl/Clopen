import Link from "next/link";
import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";

type BudgetRow = {
  gl_account_id: string;
  code: string;
  name: string;
  account_type: string;
  budgeted_amount: number;
  actual_amount: number;
  variance: number;
  variance_pct: number | null;
};

type FiscalPeriod = {
  id: string;
  fiscal_year: number;
  period_number: number;
  period_start: string;
  period_end: string;
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  revenue: "Revenue",
  cogs: "Cost of goods sold",
  labor: "Labor",
  controllable: "Controllable expenses",
  occupancy: "Occupancy",
  g_and_a: "General & administrative",
  other: "Other",
};

// Revenue coming in over budget is good; every cost line coming in over
// budget is bad. Flip the color logic per account_type instead of always
// treating "positive variance" as good.
function varianceColor(accountType: string, variance: number) {
  if (variance === 0) return "text-zinc-500";
  const isGood = accountType === "revenue" ? variance > 0 : variance < 0;
  return isGood ? "text-emerald-600" : "text-red-600";
}

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { user, profile, restaurant, supabase } = await getCurrentProfile();
  const { period: periodParam } = await searchParams;

  if (!user || !restaurant) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-zinc-500">
          Sign in with a restaurant assigned to view reports.
        </main>
      </div>
    );
  }

  if (profile?.role !== "owner_admin") {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h1 className="text-xl font-semibold text-zinc-900">
            Reports are owner/admin only
          </h1>
        </main>
      </div>
    );
  }

  if (!restaurant.organization_id) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-zinc-500">
          This restaurant isn&apos;t linked to an organization yet.
        </main>
      </div>
    );
  }

  const { data: fiscalPeriods } = await supabase
    .from("fiscal_periods")
    .select("id, fiscal_year, period_number, period_start, period_end")
    .eq("organization_id", restaurant.organization_id)
    .order("fiscal_year", { ascending: true })
    .order("period_number", { ascending: true });

  const periods: FiscalPeriod[] = fiscalPeriods ?? [];

  if (periods.length === 0) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-zinc-500">
          No fiscal calendar yet.
        </main>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const currentByDate = periods.find(
    (p) => p.period_start <= today && today <= p.period_end,
  );
  const selected =
    periods.find((p) => p.id === periodParam) ??
    currentByDate ??
    periods[periods.length - 1];

  const { data: budgetRows } = await supabase.rpc("gl_budget_vs_actual", {
    p_restaurant_id: restaurant.id,
    p_fiscal_period_id: selected.id,
  });

  const rows: BudgetRow[] = (budgetRows ?? []).filter(
    (r: BudgetRow) => r.budgeted_amount !== 0 || r.actual_amount !== 0,
  );

  const grouped = new Map<string, BudgetRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.account_type) ?? [];
    list.push(row);
    grouped.set(row.account_type, list);
  }

  const accountTypeOrder = [
    "revenue",
    "cogs",
    "labor",
    "controllable",
    "occupancy",
    "g_and_a",
    "other",
  ];

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              Budget vs. Actual
            </h1>
            <p className="text-sm text-zinc-500">
              {restaurant.name} &middot; Period {selected.period_number}, FY
              {selected.fiscal_year} ({selected.period_start} –{" "}
              {selected.period_end})
            </p>
          </div>
          <Link
            href="/reports"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
          >
            ← P&amp;L
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          {periods.map((p) => (
            <Link
              key={p.id}
              href={`/reports/budget?period=${p.id}`}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                p.id === selected.id
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-300 text-zinc-600 hover:border-zinc-400"
              }`}
            >
              P{p.period_number} FY{p.fiscal_year}
            </Link>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No budget lines or activity for this period yet.
          </p>
        ) : (
          accountTypeOrder
            .filter((type) => grouped.has(type))
            .map((type) => {
              const typeRows = grouped.get(type)!;
              const subtotalBudget = typeRows.reduce(
                (sum, r) => sum + r.budgeted_amount,
                0,
              );
              const subtotalActual = typeRows.reduce(
                (sum, r) => sum + r.actual_amount,
                0,
              );
              return (
                <div
                  key={type}
                  className="overflow-hidden rounded-xl border border-zinc-200 bg-white"
                >
                  <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-2.5">
                    <span className="text-sm font-semibold text-zinc-900">
                      {ACCOUNT_TYPE_LABELS[type] ?? type}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {money(subtotalActual)} actual / {money(subtotalBudget)}{" "}
                      budgeted
                    </span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-zinc-400">
                        <th className="px-4 py-2 font-medium">Account</th>
                        <th className="px-4 py-2 text-right font-medium">
                          Budgeted
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          Actual
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          Variance
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          Variance %
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {typeRows.map((row) => (
                        <tr
                          key={row.gl_account_id}
                          className="border-t border-zinc-100"
                        >
                          <td className="px-4 py-2 text-zinc-700">
                            <span className="text-zinc-400">{row.code}</span>{" "}
                            {row.name}
                          </td>
                          <td className="px-4 py-2 text-right text-zinc-600">
                            {money(row.budgeted_amount)}
                          </td>
                          <td className="px-4 py-2 text-right text-zinc-900">
                            {money(row.actual_amount)}
                          </td>
                          <td
                            className={`px-4 py-2 text-right ${varianceColor(row.account_type, row.variance)}`}
                          >
                            {money(row.variance)}
                          </td>
                          <td
                            className={`px-4 py-2 text-right ${varianceColor(row.account_type, row.variance)}`}
                          >
                            {row.variance_pct === null
                              ? "—"
                              : `${row.variance_pct.toFixed(1)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })
        )}
      </main>
    </div>
  );
}
