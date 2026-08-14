import Link from "next/link";
import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";

type PoLine = { quantity_ordered: number; unit_cost: number };
type PoRow = {
  id: string;
  status: string;
  order_date: string;
  expected_delivery_date: string | null;
  vendors: { name: string } | null;
  purchase_order_lines: PoLine[];
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-600",
  submitted: "bg-blue-100 text-blue-700",
  partially_received: "bg-amber-100 text-amber-700",
  received: "bg-emerald-100 text-emerald-700",
  closed: "bg-zinc-100 text-zinc-500",
  cancelled: "bg-red-100 text-red-700",
};

export default async function PurchasingPage() {
  const { user, profile, restaurant, supabase } = await getCurrentProfile();

  if (!user || !restaurant) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-zinc-500">
          Sign in with a restaurant assigned to view purchasing.
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
            Purchasing is owner/admin only
          </h1>
        </main>
      </div>
    );
  }

  const { data: purchaseOrders } = await supabase
    .from("purchase_orders")
    .select(
      "id, status, order_date, expected_delivery_date, vendors(name), purchase_order_lines(quantity_ordered, unit_cost)",
    )
    .eq("restaurant_id", restaurant.id)
    .order("order_date", { ascending: false });

  const orders = (purchaseOrders ?? []) as unknown as PoRow[];

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              Purchasing
            </h1>
            <p className="text-sm text-zinc-500">{restaurant.name}</p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/inventory/purchasing/import-plcb"
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Import PLCB invoice
            </Link>
            <Link
              href="/inventory"
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
            >
              ← Inventory
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-400">
                <th className="px-4 py-3 font-medium">Vendor</th>
                <th className="px-4 py-3 font-medium">Order date</th>
                <th className="px-4 py-3 font-medium">Expected</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((po) => {
                const total = po.purchase_order_lines.reduce(
                  (sum, l) => sum + l.quantity_ordered * l.unit_cost,
                  0,
                );
                return (
                  <tr key={po.id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-4 py-2.5 text-zinc-900">
                      {po.vendors?.name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600">
                      {po.order_date}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500">
                      {po.expected_delivery_date ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[po.status] ?? "bg-zinc-100 text-zinc-600"}`}
                      >
                        {po.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-900">
                      {money(total)}
                    </td>
                  </tr>
                );
              })}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                    No purchase orders yet.
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
