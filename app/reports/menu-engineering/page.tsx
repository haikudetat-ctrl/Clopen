import Link from "next/link";
import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";

type EngineeringRow = {
  kind: string;
  item_id: string;
  name: string;
  category_name: string | null;
  price: number | null;
  theoretical_cost: number;
  cost_pct: number | null;
  is_costed: boolean;
  target_pct: number;
  over_target: boolean;
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);

function costColor(row: EngineeringRow) {
  if (!row.is_costed || row.price === null) return "text-zinc-400";
  if (row.over_target) return "text-red-600";
  return "text-emerald-600";
}

function Table({ rows, targetPct }: { rows: EngineeringRow[]; targetPct: number }) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-400">
            <th className="px-4 py-3 font-medium">Item</th>
            <th className="px-4 py-3 text-right font-medium">Price</th>
            <th className="px-4 py-3 text-right font-medium">
              Theoretical cost
            </th>
            <th className="px-4 py-3 text-right font-medium">Cost %</th>
            <th className="px-4 py-3 text-right font-medium">Margin</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.item_id} className="border-b border-zinc-100 last:border-0">
              <td className="px-4 py-2.5 text-zinc-900">
                {row.name}
                {row.category_name && (
                  <span className="ml-2 text-xs text-zinc-400">
                    {row.category_name}
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right text-zinc-700">
                {row.price === null ? "not priced" : money(row.price)}
              </td>
              <td className="px-4 py-2.5 text-right text-zinc-500">
                {row.is_costed ? money(row.theoretical_cost) : "not costed"}
              </td>
              <td className={`px-4 py-2.5 text-right font-medium ${costColor(row)}`}>
                {row.is_costed && row.price !== null ? (
                  <>
                    {pct(row.cost_pct)}
                    {row.over_target && (
                      <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                        over {targetPct}% target
                      </span>
                    )}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-2.5 text-right text-zinc-700">
                {row.is_costed && row.price !== null
                  ? money(row.price - row.theoretical_cost)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function MenuEngineeringPage() {
  const { user, profile, restaurant, supabase } = await getCurrentProfile();

  if (!user || !restaurant) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-zinc-500">
          Sign in with a restaurant assigned to view menu engineering.
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
            Menu engineering is owner/admin only
          </h1>
        </main>
      </div>
    );
  }

  const { data, error } = await supabase.rpc("inventory_menu_engineering", {
    p_restaurant_id: restaurant.id,
  });

  const rows: EngineeringRow[] = data ?? [];
  const foodRows = rows.filter((r) => r.kind === "food");
  const beverageRows = rows.filter((r) => r.kind === "beverage");
  const costedRows = rows.filter((r) => r.is_costed && r.price !== null);
  const notCosted = rows.filter((r) => !r.is_costed || r.price === null);
  const overTargetCount = rows.filter((r) => r.over_target).length;

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              Menu Engineering
            </h1>
            <p className="text-sm text-zinc-500">
              {restaurant.name} &middot; theoretical cost vs. menu price
            </p>
          </div>
          <Link
            href="/reports"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
          >
            ← Reports
          </Link>
        </div>

        {error ? (
          <p className="text-sm text-red-600">
            Couldn&apos;t load menu engineering: {error.message}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-zinc-200 bg-white p-5">
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Costed items
                </div>
                <div className="mt-1 text-2xl font-semibold text-zinc-900">
                  {costedRows.length}{" "}
                  <span className="text-base font-normal text-zinc-400">
                    / {rows.length}
                  </span>
                </div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-5">
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Over target cost %
                </div>
                <div
                  className={`mt-1 text-2xl font-semibold ${overTargetCount > 0 ? "text-red-600" : "text-zinc-900"}`}
                >
                  {overTargetCount}
                </div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-5">
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Not yet costed
                </div>
                <div className="mt-1 text-2xl font-semibold text-zinc-900">
                  {notCosted.length}
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-zinc-100 px-4 py-3 text-xs text-zinc-500">
              Targets: food ≤30% of price, beverage ≤20% of price — standard
              full-service benchmarks, not restaurant-specific goals yet.
              Theoretical cost only reflects ingredients tracked in the
              inventory catalog; untracked garnishes, bread, and other
              pantry items aren&apos;t included, so real cost % typically
              runs a bit higher than shown here.
            </div>

            <section>
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
                Food ({foodRows.filter((r) => r.is_costed).length} costed)
              </h2>
              <Table rows={foodRows.filter((r) => r.is_costed)} targetPct={30} />
            </section>

            <section>
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
                Beverage ({beverageRows.filter((r) => r.is_costed).length} costed)
              </h2>
              <Table rows={beverageRows.filter((r) => r.is_costed)} targetPct={20} />
            </section>

            {notCosted.length > 0 && (
              <details className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
                <summary className="cursor-pointer font-medium text-zinc-700">
                  {notCosted.length} item{notCosted.length === 1 ? "" : "s"}{" "}
                  not yet costed or priced
                </summary>
                <ul className="mt-3 flex flex-col gap-1.5 text-zinc-500">
                  {notCosted.map((r) => (
                    <li key={r.item_id} className="flex justify-between">
                      <span>{r.name}</span>
                      <span className="text-xs">
                        {r.price === null ? "no price set" : "no recipe linked"}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </main>
    </div>
  );
}
