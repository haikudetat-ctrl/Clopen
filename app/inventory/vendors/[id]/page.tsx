import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";
import { VendorFormClient } from "../vendor-form-client";
import { setVendorActiveForm } from "../actions";

type VendorItemRow = {
  id: string;
  vendor_sku: string | null;
  pack_description: string | null;
  current_unit_cost: number;
  is_preferred: boolean;
  is_active: boolean;
  last_purchased_at: string | null;
  inventory_items: { name: string } | null;
  units_of_measure: { abbreviation: string } | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  invoice_date: string;
  total_amount: number;
  status: string;
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, profile, restaurant, supabase } = await getCurrentProfile();

  if (!user || !restaurant) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-zinc-500">
          Sign in with a restaurant assigned to view this vendor.
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

  const { data: vendor } = await supabase
    .from("vendors")
    .select(
      "id, name, contact_name, contact_email, contact_phone, account_number, payment_terms, is_active, organization_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (!vendor || vendor.organization_id !== restaurant.organization_id) {
    notFound();
  }

  const [{ data: vendorItems }, { data: invoices }] = await Promise.all([
    supabase
      .from("vendor_items")
      .select(
        "id, vendor_sku, pack_description, current_unit_cost, is_preferred, is_active, last_purchased_at, inventory_items(name), units_of_measure(abbreviation)",
      )
      .eq("vendor_id", vendor.id)
      .order("is_preferred", { ascending: false }),
    supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, total_amount, status")
      .eq("vendor_id", vendor.id)
      .eq("restaurant_id", restaurant.id)
      .order("invoice_date", { ascending: false })
      .limit(20),
  ]);

  const itemRows = (vendorItems ?? []) as unknown as VendorItemRow[];
  const invoiceRows: InvoiceRow[] = invoices ?? [];
  const totalSpend = invoiceRows.reduce((sum, i) => sum + i.total_amount, 0);

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              {vendor.name}
            </h1>
            <p className="text-sm text-zinc-500">
              {vendor.is_active ? "Active" : "Inactive"} vendor
            </p>
          </div>
          <Link
            href="/inventory/vendors"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
          >
            ← Vendors
          </Link>
        </div>

        <VendorFormClient
          vendor={{
            id: vendor.id,
            name: vendor.name,
            contact_name: vendor.contact_name,
            contact_email: vendor.contact_email,
            contact_phone: vendor.contact_phone,
            account_number: vendor.account_number,
            payment_terms: vendor.payment_terms,
          }}
        />

        <form action={setVendorActiveForm}>
          <input type="hidden" name="id" value={vendor.id} />
          <input
            type="hidden"
            name="is_active"
            value={vendor.is_active ? "false" : "true"}
          />
          <button
            type="submit"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
          >
            Mark as {vendor.is_active ? "inactive" : "active"}
          </button>
        </form>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
            Items sourced ({itemRows.length})
          </h2>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-400">
                  <th className="px-4 py-2.5 font-medium">Item</th>
                  <th className="px-4 py-2.5 font-medium">SKU</th>
                  <th className="px-4 py-2.5 font-medium">Pack</th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    Unit cost
                  </th>
                  <th className="px-4 py-2.5 font-medium">Last purchased</th>
                </tr>
              </thead>
              <tbody>
                {itemRows.map((item) => (
                  <tr key={item.id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-4 py-2 text-zinc-900">
                      {item.inventory_items?.name ?? "—"}
                      {item.is_preferred && (
                        <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                          preferred
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-zinc-500">
                      {item.vendor_sku ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-zinc-500">
                      {item.pack_description ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-700">
                      {money(item.current_unit_cost)}
                      <span className="ml-1 text-zinc-400">
                        / {item.units_of_measure?.abbreviation ?? ""}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-zinc-500">
                      {item.last_purchased_at
                        ? new Date(item.last_purchased_at).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
                {itemRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-zinc-400">
                      No items sourced from this vendor yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">
              Recent invoices, {restaurant.name}
            </h2>
            <span className="text-sm text-zinc-500">
              {money(totalSpend)} total shown
            </span>
          </div>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-400">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Invoice #</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoiceRows.map((inv) => (
                  <tr key={inv.id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-4 py-2 text-zinc-900">{inv.invoice_date}</td>
                    <td className="px-4 py-2 text-zinc-500">
                      {inv.invoice_number ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-900">
                      {money(inv.total_amount)}
                    </td>
                    <td className="px-4 py-2 text-zinc-500">{inv.status}</td>
                  </tr>
                ))}
                {invoiceRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-zinc-400">
                      No invoices from this vendor at {restaurant.name} yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
