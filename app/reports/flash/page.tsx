import Link from "next/link";
import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";

type FlashRow = {
  sales_date: string;
  net_sales: number;
  labor_cost: number;
  labor_pct: number | null;
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const DAY_LABEL = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

// Full-service prime-cost labor generally runs 28-33% of sales; flag
// anything meaningfully outside a reasonable band rather than picking one
// magic number, since a single unusually slow or busy day will swing this.
function laborColor(pct: number | null) {
  if (pct === null) return "text-zinc-400";
  if (pct > 34) return "text-red-600";
  if (pct < 20) return "text-amber-600";
  return "text-emerald-600";
}

export default async function FlashReportPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { user, profile, restaurant, supabase } = await getCurrentProfile();
  const { days: daysParam } = await searchParams;

  if (!user || !restaurant) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-zinc-500">
          Sign in with a restaurant assigned to view the flash report.
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

  const windowDays = daysParam === "30" ? 30 : daysParam === "7" ? 7 : 14;
  const today = new Date().toISOString().slice(0, 10);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (windowDays - 1));
  const start = startDate.toISOString().slice(0, 10);

  const { data: flashRows } = await supabase.rpc("gl_daily_flash", {
    p_restaurant_id: restaurant.id,
    p_start_date: start,
    p_end_date: today,
  });

  const rows: FlashRow[] = (flashRows ?? []).slice().reverse();
  const daysWithSales = rows.filter((r) => r.net_sales > 0);
  const totalSales = rows.reduce((sum, r) => sum + r.net_sales, 0);
  const totalLabor = rows.reduce((sum, r) => sum + r.labor_cost, 0);
  const avgDailySales =
    daysWithSales.length > 0 ? totalSales / daysWithSales.length : 0;
  const blendedLaborPct = totalSales > 0 ? (totalLabor / totalSales) * 100 : null;
  const maxSales = Math.max(1, ...rows.map((r) => r.net_sales));

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              Daily Flash
            </h1>
            <p className="text-sm text-zinc-500">
              {restaurant.name} &middot; sales vs. scheduled labor, day by day
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
          {[7, 14, 30].map((d) => (
            <Link
              key={d}
              href={`/reports/flash?days=${d}`}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                windowDays === d
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-300 text-zinc-600 hover:border-zinc-400"
              }`}
            >
              Last {d} days
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Avg. daily sales
            </div>
            <div className="mt-1 text-2xl font-semibold text-zinc-900">
              {money(avgDailySales)}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Blended labor %
            </div>
            <div
              className={`mt-1 text-2xl font-semibold ${laborColor(blendedLaborPct)}`}
            >
              {blendedLaborPct === null ? "—" : `${blendedLaborPct.toFixed(1)}%`}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Total sales, period
            </div>
            <div className="mt-1 text-2xl font-semibold text-zinc-900">
              {money(totalSales)}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-400">
                <th className="px-4 py-3 font-medium">Day</th>
                <th className="px-4 py-3 font-medium">Sales</th>
                <th className="px-4 py-3 text-right font-medium">Net sales</th>
                <th className="px-4 py-3 text-right font-medium">Labor $</th>
                <th className="px-4 py-3 text-right font-medium">Labor %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.sales_date}
                  className={`border-b border-zinc-100 last:border-0 ${
                    row.sales_date === today ? "bg-blue-50/50" : ""
                  }`}
                >
                  <td className="px-4 py-2.5 text-zinc-900">
                    {DAY_LABEL(row.sales_date)}
                    {row.sales_date === today && (
                      <span className="ml-2 text-xs text-blue-600">today</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="h-2 w-full max-w-[140px] rounded-full bg-zinc-100">
                      <div
                        className="h-2 rounded-full bg-zinc-900"
                        style={{
                          width: `${Math.max(4, (row.net_sales / maxSales) * 100)}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-900">
                    {money(row.net_sales)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-500">
                    {money(row.labor_cost)}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-medium ${laborColor(row.labor_pct)}`}
                  >
                    {row.labor_pct === null ? "—" : `${row.labor_pct}%`}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                    No sales data in this window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-zinc-400">
          Labor cost is scheduled labor (hours on the schedule × pay rate),
          not clocked time -- there&apos;s no time-clock integration yet, so
          this is the best available daily proxy. Treat it as directional.
        </p>
      </main>
    </div>
  );
}
