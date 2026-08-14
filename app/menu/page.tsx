import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";
import type { Tables } from "@/lib/supabase/types";

type MenuItem = Tables<"menu_items">;
type MenuCategory = Tables<"menu_categories">;

export default async function MenuPage() {
  const { user, restaurant, supabase } = await getCurrentProfile();

  if (!user || !restaurant) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-zinc-500">
          {user ? "No restaurant assigned yet." : "Sign in to view the menu."}
        </main>
      </div>
    );
  }

  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("menu_items")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .eq("is_active", true)
      .order("name"),
  ]);

  const itemsByCategory = new Map<string | null, MenuItem[]>();
  for (const item of items ?? []) {
    const key = item.category_id;
    if (!itemsByCategory.has(key)) itemsByCategory.set(key, []);
    itemsByCategory.get(key)!.push(item);
  }

  const orderedCategories: (MenuCategory | null)[] = [
    ...(categories ?? []),
    null, // uncategorized bucket
  ];

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900">Menu</h1>

        {(items?.length ?? 0) === 0 && (
          <p className="text-sm text-zinc-500">No menu items yet.</p>
        )}

        <div className="flex flex-col gap-10">
          {orderedCategories.map((category) => {
            const key = category?.id ?? null;
            const categoryItems = itemsByCategory.get(key);
            if (!categoryItems || categoryItems.length === 0) return null;

            return (
              <section key={key ?? "uncategorized"}>
                <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
                  {category?.name ?? "Other"}
                </h2>
                <div className="flex flex-col gap-4">
                  {categoryItems.map((item) => (
                    <MenuItemCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function MenuItemCard({ item }: { item: MenuItem }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-zinc-900">{item.name}</h3>
            {item.is_86d && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                86&apos;d
              </span>
            )}
          </div>
          {item.pronunciation && (
            <p className="text-xs italic text-zinc-400">
              {item.pronunciation}
            </p>
          )}
        </div>
        {item.price != null && (
          <div className="shrink-0 font-medium text-zinc-900">
            ${item.price}
          </div>
        )}
      </div>

      {item.guest_description && (
        <p className="mt-2 text-sm text-zinc-600">{item.guest_description}</p>
      )}

      {item.allergens && item.allergens.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.allergens.map((allergen) => (
            <span
              key={allergen}
              className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
            >
              {allergen}
            </span>
          ))}
        </div>
      )}

      {(item.service_script || item.upsell_notes || item.pairings) && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-zinc-500 hover:text-zinc-900">
            Staff notes
          </summary>
          <div className="mt-2 flex flex-col gap-2 border-l-2 border-zinc-200 pl-3 text-zinc-600">
            {item.service_script && (
              <p>
                <span className="font-medium text-zinc-700">Script: </span>
                {item.service_script}
              </p>
            )}
            {item.pairings && (
              <p>
                <span className="font-medium text-zinc-700">Pairings: </span>
                {item.pairings}
              </p>
            )}
            {item.upsell_notes && (
              <p>
                <span className="font-medium text-zinc-700">Upsell: </span>
                {item.upsell_notes}
              </p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
