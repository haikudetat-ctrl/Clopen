import Link from "next/link";
import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";

export default async function Home() {
  const { user, profile, restaurant, supabase } = await getCurrentProfile();

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 px-6 text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">Clopen</h1>
        <p className="max-w-sm text-zinc-500">
          Sign in to see your restaurant&apos;s menu, training, and shift
          notes.
        </p>
        <a
          href="/login"
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Sign in
        </a>
      </main>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h1 className="text-xl font-semibold text-zinc-900">
            No restaurant assigned yet
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Signed in as {profile?.full_name ?? user.email}. Ask an owner or
            admin to add you to a restaurant.
          </p>
        </main>
      </div>
    );
  }

  const isOwnerAdmin = profile?.role === "owner_admin";
  const today = new Date().toISOString().slice(0, 10);

  // Prime cost "to date" needs to be anchored to the current FISCAL period,
  // not the calendar month -- this business runs a 4-4-5 calendar, and COGS
  // posts in lump sums at period-count-close rather than continuously, so a
  // calendar month-to-date window can accidentally straddle a neighboring
  // period's count-close entry and produce a wildly misleading percentage.
  const { data: currentPeriod } = isOwnerAdmin
    ? await supabase
        .from("fiscal_periods")
        .select("period_start")
        .eq("organization_id", restaurant.organization_id ?? "")
        .lte("period_start", today)
        .gte("period_end", today)
        .maybeSingle()
    : { data: null };
  const periodStart = currentPeriod?.period_start ?? today;

  const [
    { count: pinnedNotesCount },
    { count: modulesCount },
    todaySalesResult,
    ptdPnlResult,
    outstandingApResult,
  ] = await Promise.all([
    supabase
      .from("shift_notes")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurant.id)
      .eq("is_active", true)
      .eq("is_pinned", true),
    supabase
      .from("training_modules")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurant.id)
      .eq("is_active", true),
    isOwnerAdmin
      ? supabase
          .from("daily_sales")
          .select("gross_amount, discounts, comps, net_amount")
          .eq("restaurant_id", restaurant.id)
          .eq("sales_date", today)
      : Promise.resolve({ data: null }),
    isOwnerAdmin
      ? supabase.rpc("gl_pnl_summary", {
          p_restaurant_id: restaurant.id,
          p_start_date: periodStart,
          p_end_date: today,
        })
      : Promise.resolve({ data: null }),
    isOwnerAdmin
      ? supabase
          .from("invoices")
          .select("total_amount")
          .eq("restaurant_id", restaurant.id)
          .neq("status", "paid")
      : Promise.resolve({ data: null }),
  ]);

  const todaySales = (todaySalesResult.data ?? []).reduce(
    (sum, r) => sum + (r.net_amount ?? r.gross_amount - r.discounts - r.comps),
    0,
  );
  const primeCostRow = (
    ptdPnlResult.data as { line_item: string; pct_of_revenue: number | null }[] | null
  )?.find((r) => r.line_item === "Prime Cost");
  const outstandingAp = (outstandingApResult.data ?? []).reduce(
    (sum, r) => sum + r.total_amount,
    0,
  );

  const money = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">
            {restaurant.name}
          </h1>
          <p className="text-sm text-zinc-500">
            Signed in as {profile?.full_name ?? user.email} &middot; role:{" "}
            {profile?.role ?? "unknown"}
          </p>
        </div>

        {isOwnerAdmin && (
          <div className="grid grid-cols-3 gap-4">
            <Link
              href="/reports/flash"
              className="rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-300"
            >
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Today&apos;s sales
              </div>
              <div className="mt-1 text-2xl font-semibold text-zinc-900">
                {money(todaySales)}
              </div>
            </Link>
            <Link
              href="/reports"
              className="rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-300"
            >
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Period prime cost
              </div>
              <div className="mt-1 text-2xl font-semibold text-zinc-900">
                {primeCostRow?.pct_of_revenue !== undefined &&
                primeCostRow?.pct_of_revenue !== null
                  ? `${primeCostRow.pct_of_revenue.toFixed(1)}%`
                  : "—"}
              </div>
            </Link>
            <Link
              href="/inventory/purchasing"
              className="rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-300"
            >
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Outstanding AP
              </div>
              <div
                className={`mt-1 text-2xl font-semibold ${outstandingAp > 0 ? "text-amber-700" : "text-zinc-900"}`}
              >
                {money(outstandingAp)}
              </div>
            </Link>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Link
            href="/shift-notes"
            className="rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-300"
          >
            <div className="text-2xl font-semibold text-zinc-900">
              {pinnedNotesCount ?? 0}
            </div>
            <div className="text-sm text-zinc-500">Pinned shift notes</div>
          </Link>
          <Link
            href="/training"
            className="rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-300"
          >
            <div className="text-2xl font-semibold text-zinc-900">
              {modulesCount ?? 0}
            </div>
            <div className="text-sm text-zinc-500">Training modules</div>
          </Link>
        </div>

        <div className="flex gap-3">
          <Link
            href="/menu"
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700"
          >
            View menu
          </Link>
          <Link
            href="/shift-notes"
            className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 hover:border-zinc-400"
          >
            Today&apos;s notes
          </Link>
        </div>
      </main>
    </div>
  );
}
