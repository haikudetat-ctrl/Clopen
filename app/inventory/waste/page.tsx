import Link from "next/link";
import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";
import { WasteLogClient } from "./waste-log-client";

type WasteRow = {
  id: string;
  occurred_at: string;
  quantity_delta: number;
  unit_cost_at_transaction: number;
  reason_code: string | null;
  notes: string | null;
  inventory_items: { name: string; units_of_measure: { abbreviation: string } | null } | null;
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const REASON_LABELS: Record<string, string> = {
  spoilage: "Spoilage",
  over_prep: "Over-prep",
  breakage: "Breakage / dropped",
  expired: "Expired",
  quality_reject: "Quality reject",
  comp_error: "Comp / kitchen error",
  other: "Other",
};

export default async function WastePage() {
  const { user, profile, restaurant, supabase } = await getCurrentProfile();

  if (!user || !restaurant) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-zinc-500">
          Sign in with a restaurant assigned to view waste.
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
            Waste tracking is owner/admin only
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

  const today = new Date().toISOString().slice(0, 10);

  const { data: currentPeriod } = await supabase
    .from("fiscal_periods")
    .select("period_start")
    .eq("organization_id", restaurant.organization_id)
    .lte("period_start", today)
    .gte("period_end", today)
    .maybeSingle();
  const periodStart = currentPeriod?.period_start ?? today;

  const [{ data: itemRows }, { data: wasteRows }, { data: periodWasteRows }] =
    await Promise.all([
      supabase
        .from("inventory_items")
        .select("id, name, units_of_measure(abbreviation)")
        .eq("organization_id", restaurant.organization_id)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("inventory_stock_ledger")
        .select(
          "id, occurred_at, quantity_delta, unit_cost_at_transaction, reason_code, notes, inventory_items(name, units_of_measure(abbreviation))",
        )
        .eq("restaurant_id", restaurant.id)
        .eq("transaction_type", "waste")
        .order("occurred_at", { ascending: false })
        .limit(50),
      supabase
        .from("inventory_stock_ledger")
        .select("quantity_delta, unit_cost_at_transaction, reason_code")
        .eq("restaurant_id", restaurant.id)
        .eq("transaction_type", "waste")
        .gte("occurred_at", periodStart),
    ]);

  const items = (itemRows ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    unit_abbreviation:
      (i.units_of_measure as unknown as { abbreviation: string } | null)
        ?.abbreviation ?? "",
  }));

  const wasteLog = (wasteRows ?? []) as unknown as WasteRow[];

  const periodTotal = (periodWasteRows ?? []).reduce(
    (sum, r) => sum + Math.abs(r.quantity_delta) * r.unit_cost_at_transaction,
    0,
  );

  const byReason = new Map<string, number>();
  for (const r of periodWasteRows ?? []) {
    const key = r.reason_code ?? "other";
    const value = Math.abs(r.quantity_delta) * r.unit_cost_at_transaction;
    byReason.set(key, (byReason.get(key) ?? 0) + value);
  }
  const reasonBreakdown = [...byReason.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Waste</h1>
            <p className="text-sm text-zinc-500">{restaurant.name}</p>
          </div>
          <Link
            href="/inventory"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
          >
            ← Inventory
          </Link>
        </div>

        <WasteLogClient restaurantId={restaurant.id} items={items} />

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Waste this period
            </div>
            <div className="mt-1 text-2xl font-semibold text-zinc-900">
              {money(periodTotal)}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Top reason, this period
            </div>
            <div className="mt-1 text-2xl font-semibold text-zinc-900">
              {reasonBreakdown[0]
                ? (REASON_LABELS[reasonBreakdown[0][0]] ?? reasonBreakdown[0][0])
                : "—"}
            </div>
            {reasonBreakdown[0] && (
              <div className="text-xs text-zinc-500">
                {money(reasonBreakdown[0][1])}
              </div>
            )}
          </div>
        </div>

        {reasonBreakdown.length > 1 && (
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
              Waste by reason, this period
            </div>
            <div className="flex flex-col gap-2">
              {reasonBreakdown.map(([reason, amount]) => (
                <div key={reason} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-700">
                    {REASON_LABELS[reason] ?? reason}
                  </span>
                  <span className="font-medium text-zinc-900">{money(amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-400">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 text-right font-medium">Qty</th>
                <th className="px-4 py-3 text-right font-medium">Cost</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {wasteLog.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-2.5 text-zinc-900">
                    {new Date(row.occurred_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-900">
                    {row.inventory_items?.name ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-700">
                    {Math.abs(row.quantity_delta).toFixed(2)}{" "}
                    <span className="text-zinc-400">
                      {row.inventory_items?.units_of_measure?.abbreviation ?? ""}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-900">
                    {money(Math.abs(row.quantity_delta) * row.unit_cost_at_transaction)}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500">
                    {REASON_LABELS[row.reason_code ?? ""] ?? row.reason_code ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500">{row.notes ?? "—"}</td>
                </tr>
              ))}
              {wasteLog.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                    No waste logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
