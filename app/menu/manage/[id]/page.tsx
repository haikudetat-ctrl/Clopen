import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";
import type { Tables } from "@/lib/supabase/types";
import { MenuItemFormClient } from "../../menu-item-form-client";
import { setMenuItemActiveForm, setMenuItemEightySixedForm } from "../../actions";

type MenuCategory = Tables<"menu_categories">;

export default async function MenuItemDetailPage({
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
          Sign in with a restaurant assigned to manage the menu.
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
            Menu management is owner/admin only
          </h1>
        </main>
      </div>
    );
  }

  const [{ data: item }, { data: categories }] = await Promise.all([
    supabase.from("menu_items").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("menu_categories")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("sort_order"),
  ]);

  if (!item || item.restaurant_id !== restaurant.id) {
    notFound();
  }

  const categoryRows: MenuCategory[] = categories ?? [];

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              {item.name}
            </h1>
            <p className="text-sm text-zinc-500">
              {item.is_active ? "Active" : "Inactive"} ·{" "}
              {item.is_86d ? "86'd" : "Available"}
            </p>
          </div>
          <Link
            href="/menu/manage"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
          >
            ← All items
          </Link>
        </div>

        <MenuItemFormClient
          item={{
            id: item.id,
            name: item.name,
            category_id: item.category_id,
            price: item.price,
            pronunciation: item.pronunciation,
            short_description: item.short_description,
            guest_description: item.guest_description,
            allergens: item.allergens,
            dietary_tags: item.dietary_tags,
            service_script: item.service_script,
            pairings: item.pairings,
            upsell_notes: item.upsell_notes,
            is_86d: item.is_86d,
          }}
          categories={categoryRows}
        />

        <div className="flex gap-3">
          <form action={setMenuItemEightySixedForm}>
            <input type="hidden" name="id" value={item.id} />
            <input
              type="hidden"
              name="is_86d"
              value={item.is_86d ? "false" : "true"}
            />
            <button
              type="submit"
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
            >
              {item.is_86d ? "Un-86 this item" : "86 this item"}
            </button>
          </form>

          <form action={setMenuItemActiveForm}>
            <input type="hidden" name="id" value={item.id} />
            <input
              type="hidden"
              name="is_active"
              value={item.is_active ? "false" : "true"}
            />
            <button
              type="submit"
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
            >
              {item.is_active
                ? "Remove from menu (mark inactive)"
                : "Restore to menu"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
