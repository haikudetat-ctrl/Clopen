import Link from "next/link";
import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";
import { VendorFormClient } from "./vendor-form-client";

type VendorRow = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  payment_terms: string | null;
  is_active: boolean;
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function VendorsPage() {
  const { user, profile, restaurant, supabase } = await getCurrentProfile();

  if (!user || !restaurant) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-zinc-500">
          Sign in with a restaurant assigned to view vendors.
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
            Vendors are owner/admin only
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

  const [{ data: vendors }, { data: vendorItemCounts }, { data: invoices }] =
    await Promise.all([
      supabase
        .from("vendors")
        .select(
          "id, name, contact_name, contact_email, contact_phone, payment_terms, is_active",
        )
        .eq("organization_id", restaurant.organization_id)
        .order("name"),
      supabase
        .from("vendor_items")
        .select("vendor_id")
        .eq("is_active", true),
      supabase
        .from("invoices")
        .select("vendor_id, total_amount")
        .eq("restaurant_id", restaurant.id),
    ]);

  const vendorRows: VendorRow[] = vendors ?? [];

  const itemCountByVendor = new Map<string, number>();
  for (const row of vendorItemCounts ?? []) {
    itemCountByVendor.set(row.vendor_id, (itemCountByVendor.get(row.vendor_id) ?? 0) + 1);
  }

  const spendByVendor = new Map<string, number>();
  for (const inv of invoices ?? []) {
    if (!inv.vendor_id) continue;
    spendByVendor.set(inv.vendor_id, (spendByVendor.get(inv.vendor_id) ?? 0) + inv.total_amount);
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Vendors</h1>
            <p className="text-sm text-zinc-500">
              Shared across every restaurant in your organization
            </p>
          </div>
          <Link
            href="/inventory"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
          >
            ← Inventory
          </Link>
        </div>

        <VendorFormClient />

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-400">
                <th className="px-4 py-3 font-medium">Vendor</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Terms</th>
                <th className="px-4 py-3 text-right font-medium">Items sourced</th>
                <th className="px-4 py-3 text-right font-medium">
                  Spend, this restaurant
                </th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {vendorRows.map((v) => (
                <tr key={v.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/inventory/vendors/${v.id}`}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      {v.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500">
                    {v.contact_name ?? "—"}
                    {v.contact_phone && (
                      <div className="text-xs text-zinc-400">{v.contact_phone}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500">
                    {v.payment_terms ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-700">
                    {itemCountByVendor.get(v.id) ?? 0}
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-900">
                    {money(spendByVendor.get(v.id) ?? 0)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        v.is_active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {v.is_active ? "active" : "inactive"}
                    </span>
                  </td>
                </tr>
              ))}
              {vendorRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                    No vendors yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-zinc-400">
          Vendors and their item pricing (vendor_items) are shared across
          every restaurant in the organization, since most operators buy
          through one set of purveyors regardless of location — spend shown
          above is scoped to {restaurant.name} specifically.
        </p>
      </main>
    </div>
  );
}
