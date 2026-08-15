import Link from "next/link";
import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";
import type { Tables } from "@/lib/supabase/types";
import { MenuItemFormClient } from "../menu-item-form-client";
import { AddCategoryForm } from "./add-category-form";
import { setMenuItemEightySixedForm } from "../actions";

type MenuItem = Tables<"menu_items">;
type MenuCategory = Tables<"menu_categories">;

export default async function MenuManagePage() {
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

  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("sort_order"),
    supabase
      .from("menu_items")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("name"),
  ]);

  const categoryRows: MenuCategory[] = categories ?? [];
  const itemRows: MenuItem[] = items ?? [];
  const categoryNameById = new Map(categoryRows.map((c) => [c.id, c.name]));

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              Manage Menu
            </h1>
            <p className="text-sm text-zinc-500">{restaurant.name}</p>
          </div>
          <Link
            href="/menu"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
          >
            ← Menu
          </Link>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">
            Categories
          </h2>
          <div className="flex flex-wrap gap-2">
            {categoryRows.map((c) => (
              <span
                key={c.id}
                className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600"
              >
                {c.name}
                {!c.is_active && " (inactive)"}
              </span>
            ))}
            {categoryRows.length === 0 && (
              <span className="text-sm text-zinc-400">No categories yet.</span>
            )}
          </div>
          <AddCategoryForm />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">
            Add item
          </h2>
          <MenuItemFormClient categories={categoryRows} />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">
            All items ({itemRows.length})
          </h2>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-400">
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 text-right font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {itemRows.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-zinc-100 last:border-0"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/menu/manage/${item.id}`}
                        className="font-medium text-zinc-900 hover:underline"
                      >
                        {item.name}
                      </Link>
                      {!item.is_active && (
                        <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
                          inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500">
                      {item.category_id
                        ? (categoryNameById.get(item.category_id) ?? "—")
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-700">
                      {item.price != null ? `$${item.price}` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          item.is_86d
                            ? "bg-red-100 text-red-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {item.is_86d ? "86'd" : "available"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <form action={setMenuItemEightySixedForm}>
                        <input type="hidden" name="id" value={item.id} />
                        <input
                          type="hidden"
                          name="is_86d"
                          value={item.is_86d ? "false" : "true"}
                        />
                        <button
                          type="submit"
                          className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400"
                        >
                          {item.is_86d ? "Un-86" : "86 it"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {itemRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-zinc-400"
                    >
                      No menu items yet.
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
