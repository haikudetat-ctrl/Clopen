import Link from "next/link";
import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";

type FiscalPeriod = {
  id: string;
  fiscal_year: number;
  period_number: number;
  period_start: string;
  period_end: string;
};

type RollupRow = {
  restaurant_id: string;
  restaurant_name: string;
  location_name: string | null;
  revenue: number;
  cogs_amount: number;
  cogs_pct: number | null;
  prime_cost_amount: number;
  prime_cost_pct: number | null;
  operating_income: number;
  operating_income_pct: number | null;
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);

const displayName = (row: RollupRow) =>
  row.location_name ? `${row.restaurant_name} — ${row.location_name}` : row.restaurant_name;

export default async function PortfolioPage({
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
          Sign in with a restaurant assigned to view the portfolio.
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
          <p className="mt-2 text-sm text-zinc-500">
            Ask an owner or admin for access if you need to see financials.
          </p>
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
        <main className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h1 className="text-xl font-semibold text-zinc-900">
            No fiscal calendar yet
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Generate a fiscal year before the portfolio view has anything to
            show.
          </p>
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
  const isPartialPeriod = selected.period_end > today;

  const { data: rollupData, error: rollupError } = await supabase.rpc(
    "gl_restaurant_rollup",
    {
      p_organization_id: restaurant.organization_id,
      p_start_date: selected.period_start,
      p_end_date: selected.period_end,
    },
  );

  const rows: RollupRow[] = rollupData ?? [];

  const totals = rows.reduce(
    (acc, row) => {
      acc.revenue += row.revenue;
      acc.cogsAmount += row.cogs_amount;
      acc.primeCostAmount += row.prime_cost_amount;
      acc.operatingIncome += row.operating_income;
      return acc;
    },
    { revenue: 0, cogsAmount: 0, primeCostAmount: 0, operatingIncome: 0 },
  );
  const totalCogsPct = totals.revenue > 0 ? (totals.cogsAmount / totals.revenue) * 100 : null;
  const totalPrimeCostPct =
    totals.revenue > 0 ? (totals.primeCostAmount / totals.revenue) * 100 : null;
  const totalOpIncomePct =
    totals.revenue > 0 ? (totals.operatingIncome / totals.revenue) * 100 : null;

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              Portfolio
            </h1>
            <p className="text-sm text-zinc-500">
              Every restaurant in your organization &middot; Period{" "}
              {selected.period_number}, FY{selected.fiscal_year} (
              {selected.period_start} – {selected.period_end})
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
              href={`/reports/portfolio?period=${p.id}`}
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

        {isPartialPeriod && (
          <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This period is still in progress. COGS reflects the most recent
            inventory count at each restaurant, not a closed period-end
            count — treat it as an interim read, not a final number.
          </div>
        )}

        {rollupError ? (
          <p className="text-sm text-red-600">
            Couldn&apos;t load the portfolio rollup: {rollupError.message}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-400">
                  <th className="px-4 py-3 font-medium">Restaurant</th>
                  <th className="px-4 py-3 text-right font-medium">Revenue</th>
                  <th className="px-4 py-3 text-right font-medium">COGS %</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Prime Cost %
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Operating Income
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Op. Income %
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.restaurant_id}
                    className={`border-b border-zinc-100 last:border-0 ${
                      row.restaurant_id === restaurant.id ? "bg-blue-50/40" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 text-zinc-900">
                      {displayName(row)}
                      {row.restaurant_id === restaurant.id && (
                        <span className="ml-2 text-xs text-blue-600">
                          you&apos;re here
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-900">
                      {money(row.revenue)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-500">
                      {pct(row.cogs_pct)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-500">
                      {pct(row.prime_cost_pct)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right ${
                        row.operating_income < 0
                          ? "text-red-600"
                          : "text-zinc-900"
                      }`}
                    >
                      {money(row.operating_income)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-500">
                      {pct(row.operating_income_pct)}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                      No restaurants found in this organization.
                    </td>
                  </tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t border-zinc-200 bg-zinc-50 font-semibold">
                    <td className="px-4 py-2.5 text-zinc-900">Total</td>
                    <td className="px-4 py-2.5 text-right text-zinc-900">
                      {money(totals.revenue)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-600">
                      {pct(totalCogsPct)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-600">
                      {pct(totalPrimeCostPct)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right ${
                        totals.operatingIncome < 0
                          ? "text-red-600"
                          : "text-zinc-900"
                      }`}
                    >
                      {money(totals.operatingIncome)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-600">
                      {pct(totalOpIncomePct)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        <p className="text-xs text-zinc-400">
          Totals are a true weighted rollup of each restaurant&apos;s dollar
          figures, not an average of percentages — a location with more
          revenue counts proportionally more toward the blended rate.
        </p>
      </main>
    </div>
  );
}
