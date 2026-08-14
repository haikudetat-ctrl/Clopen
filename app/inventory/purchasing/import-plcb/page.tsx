import Link from "next/link";
import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";
import { ImportPlcbClient } from "./import-plcb-client";

export default async function ImportPlcbPage() {
  const { user, profile, restaurant } = await getCurrentProfile();

  if (!user || !restaurant) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-zinc-500">
          Sign in with a restaurant assigned to import invoices.
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

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              Import PLCB invoice
            </h1>
            <p className="text-sm text-zinc-500">{restaurant.name}</p>
          </div>
          <Link
            href="/inventory/purchasing"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
          >
            ← Purchasing
          </Link>
        </div>

        <p className="text-sm text-zinc-500">
          Upload a receipt PDF from the PLCB Licensee Online Order Portal.
          You&apos;ll see exactly what would be received before anything
          posts to inventory or your books.
        </p>

        <ImportPlcbClient restaurantId={restaurant.id} />
      </main>
    </div>
  );
}
