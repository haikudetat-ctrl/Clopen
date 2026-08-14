import Link from "next/link";
import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";
import { PnlTrendCharts, type TrendPoint } from "@/components/pnl-trend-chart";

type PnlRow = {
  line_item: string;
  amount: number;
  pct_of_revenue: number | null;
  sort_order: number;
};

type FiscalPeriod = {
  id: string;
  fiscal_year: number;
  period_number: number;
  quarter: number;
  week_count: number;
  period_start: string;
  period_end: string;
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);

// Lines that read as subtotals in the P&L story -- bolded and given a
// divider so the statement reads like something you'd hand an investor,
// not a flat list of rows.
const SUBTOTAL_LINES = new Set([
  "Gross Profit",
  "Prime Cost",
  "Operating Income",
]);

export default async function ReportsPage({
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
    .select(
      "id, fiscal_year, period_number, quarter, week_count, period_start, period_end",
    )
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
            Generate a fiscal year before reports have anything to show.
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

  const selectedIndex = periods.findIndex((p) => p.id === selected.id);
  const priorPeriod = selectedIndex > 0 ? periods[selectedIndex - 1] : null;

  const [{ data: currentPnl }, { data: priorPnl }] = await Promise.all([
    supabase.rpc("gl_pnl_summary", {
      p_restaurant_id: restaurant.id,
      p_start_date: selected.period_start,
      p_end_date: selected.period_end,
    }),
    priorPeriod
      ? supabase.rpc("gl_pnl_summary", {
          p_restaurant_id: restaurant.id,
          p_start_date: priorPeriod.period_start,
          p_end_date: priorPeriod.period_end,
        })
      : Promise.resolve({ data: null }),
  ]);

  const current: PnlRow[] = currentPnl ?? [];
  const prior: PnlRow[] = priorPnl ?? [];
  const priorByLine = new Map(prior.map((r) => [r.line_item, r]));

  const revenueRow = current.find((r) => r.line_item === "Revenue");
  const opIncomeRow = current.find((r) => r.line_item === "Operating Income");
  const primeCostRow = current.find((r) => r.line_item === "Prime Cost");
  const isPartialPeriod = selected.period_end > today;

  // Trend across every period through the one selected (not future periods,
  // which would just show zeros) -- gives the multi-period read investors
  // actually care about instead of just current-vs-prior.
  const trendPeriods = periods.slice(0, selectedIndex + 1);
  const trendResults = await Promise.all(
    trendPeriods.map((p) =>
      supabase.rpc("gl_pnl_summary", {
        p_restaurant_id: restaurant.id,
        p_start_date: p.period_start,
        p_end_date: p.period_end,
      }),
    ),
  );
  const trendDataAll: TrendPoint[] = trendPeriods.map((p, i) => {
    const rows: PnlRow[] = trendResults[i].data ?? [];
    const byLine = new Map(rows.map((r) => [r.line_item, r]));
    return {
      label: `P${p.period_number} FY${p.fiscal_year}`,
      revenue: byLine.get("Revenue")?.amount ?? 0,
      operatingIncome: byLine.get("Operating Income")?.amount ?? 0,
      cogsPct: byLine.get("COGS")?.pct_of_revenue ?? null,
      primeCostPct: byLine.get("Prime Cost")?.pct_of_revenue ?? null,
    };
  });
  // Early fiscal periods can exist with no revenue/COGS activity recorded
  // yet (fixed costs like rent get budgeted for the whole year before sales
  // data catches up) -- charting those as a flat run of zeros before a
  // sudden cliff reads as broken, not honest. Only trend periods that
  // actually have recorded revenue.
  const trendData = trendDataAll.filter((t) => t.revenue > 0);

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              Profit &amp; Loss
            </h1>
            <p className="text-sm text-zinc-500">
              {restaurant.name} &middot; Period {selected.period_number}, FY
              {selected.fiscal_year} ({selected.period_start} –{" "}
              {selected.period_end})
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/reports/portfolio"
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
            >
              Portfolio →
            </Link>
            <Link
              href="/reports/menu-engineering"
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
            >
              Menu engineering →
            </Link>
            <Link
              href="/reports/flash"
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
            >
              Daily flash →
            </Link>
            <Link
              href="/reports/budget"
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
            >
              Budget vs. actual →
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {periods.map((p) => (
            <Link
              key={p.id}
              href={`/reports?period=${p.id}`}
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
            inventory count, not a closed period-end count — treat it as an
            interim read, not a final number.
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Revenue
            </div>
            <div className="mt-1 text-2xl font-semibold text-zinc-900">
              {revenueRow ? money(revenueRow.amount) : "—"}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Prime Cost
            </div>
            <div className="mt-1 text-2xl font-semibold text-zinc-900">
              {primeCostRow ? pct(primeCostRow.pct_of_revenue) : "—"}
            </div>
            <div className="text-xs text-zinc-500">of revenue</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Operating Income
            </div>
            <div
              className={`mt-1 text-2xl font-semibold ${
                (opIncomeRow?.amount ?? 0) < 0
                  ? "text-red-600"
                  : "text-zinc-900"
              }`}
            >
              {opIncomeRow ? money(opIncomeRow.amount) : "—"}
            </div>
          </div>
        </div>

        {trendData.length > 1 ? (
          <PnlTrendCharts data={trendData} />
        ) : (
          <p className="text-xs text-zinc-400">
            Trend charts need at least two periods with recorded revenue to
            show a line -- they&apos;ll fill in as more periods close.
          </p>
        )}

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-400">
                <th className="px-4 py-3 font-medium">Line item</th>
                <th className="px-4 py-3 text-right font-medium">
                  This period
                </th>
                <th className="px-4 py-3 text-right font-medium">% of rev</th>
                <th className="px-4 py-3 text-right font-medium">
                  Prior period
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  % of rev
                </th>
                <th className="px-4 py-3 text-right font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {current.map((row) => {
                const priorRow = priorByLine.get(row.line_item);
                const change =
                  priorRow !== undefined ? row.amount - priorRow.amount : null;
                const isSubtotal = SUBTOTAL_LINES.has(row.line_item);
                return (
                  <tr
                    key={row.line_item}
                    className={`border-b border-zinc-100 last:border-0 ${
                      isSubtotal ? "bg-zinc-50 font-semibold" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 text-zinc-900">
                      {row.line_item}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-900">
                      {money(row.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-500">
                      {pct(row.pct_of_revenue)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-500">
                      {priorRow ? money(priorRow.amount) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-400">
                      {priorRow ? pct(priorRow.pct_of_revenue) : "—"}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right ${
                        change === null
                          ? "text-zinc-400"
                          : change > 0
                            ? "text-emerald-600"
                            : change < 0
                              ? "text-red-600"
                              : "text-zinc-500"
                      }`}
                    >
                      {change === null ? "—" : money(change)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-zinc-400">
          Prior period comparison uses the same 4-4-5 fiscal calendar
          (Period {priorPeriod?.period_number ?? "—"}, FY
          {priorPeriod?.fiscal_year ?? "—"}), so weeks line up evenly —
          apples to apples, not calendar-month noise.
        </p>
      </main>
    </div>
  );
}
