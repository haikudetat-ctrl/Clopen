import Link from "next/link";
import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";

type StockRow = {
  inventory_item_id: string;
  quantity_on_hand_base_unit: number;
  current_unit_cost: number;
  value_on_hand: number;
};

type ItemRow = {
  id: string;
  name: string;
  category_id: string | null;
  inventory_categories: { name: string } | null;
  units_of_measure: { abbreviation: string } | null;
};

type ParLevelRow = {
  inventory_item_id: string;
  par_level_quantity: number;
  reorder_point: number;
};

type ReorderSuggestion = {
  inventory_item_id: string;
  item_name: string;
  current_quantity_base_unit: number;
  par_level_quantity: number;
  reorder_point: number;
  suggested_order_quantity: number;
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function InventoryPage() {
  const { user, profile, restaurant, supabase } = await getCurrentProfile();

  if (!user || !restaurant) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-zinc-500">
          Sign in with a restaurant assigned to view inventory.
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
            Inventory is owner/admin only
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

  const [{ data: stock }, { data: items }, { data: parLevels }, { data: reorderRows }] =
    await Promise.all([
      supabase
        .from("inventory_current_stock")
        .select("inventory_item_id, quantity_on_hand_base_unit, current_unit_cost, value_on_hand")
        .eq("restaurant_id", restaurant.id),
      supabase
        .from("inventory_items")
        .select("id, name, category_id, inventory_categories(name), units_of_measure(abbreviation)")
        .eq("organization_id", restaurant.organization_id)
        .eq("is_active", true),
      supabase
        .from("inventory_par_levels")
        .select("inventory_item_id, par_level_quantity, reorder_point")
        .eq("restaurant_id", restaurant.id),
      supabase.rpc("inventory_reorder_suggestions", {
        p_restaurant_id: restaurant.id,
      }),
    ]);

  const stockRows: StockRow[] = (stock ?? []).map((s) => ({
    inventory_item_id: s.inventory_item_id ?? "",
    quantity_on_hand_base_unit: s.quantity_on_hand_base_unit ?? 0,
    current_unit_cost: s.current_unit_cost ?? 0,
    value_on_hand: s.value_on_hand ?? 0,
  }));
  const itemRows = (items ?? []) as unknown as ItemRow[];
  const parRows: ParLevelRow[] = parLevels ?? [];
  const reorderSuggestions: ReorderSuggestion[] = reorderRows ?? [];

  const stockByItem = new Map(stockRows.map((s) => [s.inventory_item_id, s]));
  const parByItem = new Map(parRows.map((p) => [p.inventory_item_id, p]));

  const totalValue = stockRows.reduce((sum, s) => sum + (s.value_on_hand ?? 0), 0);

  const byCategory = new Map<string, ItemRow[]>();
  for (const item of itemRows) {
    const key = item.inventory_categories?.name ?? "Uncategorized";
    const list = byCategory.get(key) ?? [];
    list.push(item);
    byCategory.set(key, list);
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              Inventory
            </h1>
            <p className="text-sm text-zinc-500">{restaurant.name}</p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/inventory/purchasing"
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
            >
              Purchasing
            </Link>
            <Link
              href="/inventory/counts"
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
            >
              Counts
            </Link>
            <Link
              href="/inventory/waste"
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
            >
              Waste
            </Link>
            <Link
              href="/inventory/vendors"
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
            >
              Vendors
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Total inventory value on hand
          </div>
          <div className="mt-1 text-2xl font-semibold text-zinc-900">
            {money(totalValue)}
          </div>
        </div>

        {reorderSuggestions.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-sm font-semibold text-amber-900">
              Reorder suggestions ({reorderSuggestions.length})
            </h2>
            <ul className="mt-3 flex flex-col gap-1.5 text-sm text-amber-800">
              {reorderSuggestions.map((r) => (
                <li key={r.inventory_item_id} className="flex justify-between">
                  <span>{r.item_name}</span>
                  <span>
                    {r.current_quantity_base_unit.toFixed(1)} on hand, below
                    reorder point {r.reorder_point} — suggest ordering{" "}
                    {r.suggested_order_quantity.toFixed(1)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {[...byCategory.entries()].map(([categoryName, categoryItems]) => (
          <div
            key={categoryName}
            className="overflow-hidden rounded-xl border border-zinc-200 bg-white"
          >
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-semibold text-zinc-900">
              {categoryName}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-zinc-400">
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 text-right font-medium">
                    On hand
                  </th>
                  <th className="px-4 py-2 text-right font-medium">
                    Par / reorder
                  </th>
                  <th className="px-4 py-2 text-right font-medium">
                    Unit cost
                  </th>
                  <th className="px-4 py-2 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {categoryItems.map((item) => {
                  const stockRow = stockByItem.get(item.id);
                  const par = parByItem.get(item.id);
                  const onHand = stockRow?.quantity_on_hand_base_unit ?? 0;
                  const belowReorder = par ? onHand <= par.reorder_point : false;
                  return (
                    <tr key={item.id} className="border-t border-zinc-100">
                      <td className="px-4 py-2 text-zinc-900">{item.name}</td>
                      <td
                        className={`px-4 py-2 text-right ${belowReorder ? "font-semibold text-amber-700" : "text-zinc-700"}`}
                      >
                        {onHand.toFixed(1)}{" "}
                        <span className="text-zinc-400">
                          {item.units_of_measure?.abbreviation ?? ""}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-zinc-500">
                        {par
                          ? `${par.par_level_quantity} / ${par.reorder_point}`
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-zinc-500">
                        {money(stockRow?.current_unit_cost ?? 0)}
                      </td>
                      <td className="px-4 py-2 text-right text-zinc-900">
                        {money(stockRow?.value_on_hand ?? 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </main>
    </div>
  );
}
