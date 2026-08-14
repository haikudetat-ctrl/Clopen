import Link from "next/link";
import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";

type CountSheet = { id: string; status: string; area_label: string | null };
type CountPeriod = {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  inventory_counts: CountSheet[];
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function CountsPage() {
  const { user, profile, restaurant, supabase } = await getCurrentProfile();

  if (!user || !restaurant) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-zinc-500">
          Sign in with a restaurant assigned to view counts.
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
            Counts are owner/admin only
          </h1>
        </main>
      </div>
    );
  }

  const { data: countPeriods } = await supabase
    .from("inventory_count_periods")
    .select("id, period_start, period_end, status, inventory_counts(id, status, area_label)")
    .eq("restaurant_id", restaurant.id)
    .order("period_start", { ascending: false });

  const periods = (countPeriods ?? []) as unknown as CountPeriod[];

  // Pull variance value for each closed period directly from the ledger
  // (count_adjustment entries), since that's the number that actually
  // flows into COGS -- more useful here than just "closed / open".
  const varianceByPeriod = new Map<string, number>();
  for (const period of periods) {
    if (period.status !== "closed") continue;
    const { data } = await supabase
      .from("inventory_stock_ledger")
      .select("quantity_delta, unit_cost_at_transaction")
      .eq("restaurant_id", restaurant.id)
      .eq("transaction_type", "count_adjustment")
      .gte("occurred_at", period.period_start)
      .lt("occurred_at", period.period_end);
    const total = (data ?? []).reduce(
      (sum, row) => sum + row.quantity_delta * row.unit_cost_at_transaction,
      0,
    );
    varianceByPeriod.set(period.id, total);
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              Inventory Counts
            </h1>
            <p className="text-sm text-zinc-500">{restaurant.name}</p>
          </div>
          <Link
            href="/inventory"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
          >
            ← Inventory
          </Link>
        </div>

        <div className="flex flex-col gap-4">
          {periods.map((period) => {
            const variance = varianceByPeriod.get(period.id);
            return (
              <div
                key={period.id}
                className="overflow-hidden rounded-xl border border-zinc-200 bg-white"
              >
                <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">
                      {period.period_start} – {period.period_end}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {period.inventory_counts.length} count sheet(s)
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {variance !== undefined && (
                      <span
                        className={`text-sm ${variance < 0 ? "text-red-600" : "text-emerald-600"}`}
                      >
                        {money(variance)} shrink/usage posted
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        period.status === "closed"
                          ? "bg-zinc-100 text-zinc-600"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {period.status}
                    </span>
                  </div>
                </div>
                <ul className="divide-y divide-zinc-100">
                  {period.inventory_counts.map((count) => (
                    <li
                      key={count.id}
                      className="flex items-center justify-between px-4 py-2.5 text-sm"
                    >
                      <span className="text-zinc-700">
                        {count.area_label ?? "Count sheet"}
                      </span>
                      <span className="text-zinc-500">{count.status}</span>
                    </li>
                  ))}
                  {period.inventory_counts.length === 0 && (
                    <li className="px-4 py-3 text-sm text-zinc-400">
                      No count sheets started yet.
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
          {periods.length === 0 && (
            <p className="text-sm text-zinc-500">No count periods yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}
