"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/current-profile";

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const str = String(value ?? "").trim();
  return str === "" ? null : str;
}

/** Comma-separated input -> trimmed string[], e.g. allergens, dietary tags. */
function parseList(value: FormDataEntryValue | null): string[] {
  const str = String(value ?? "").trim();
  if (!str) return [];
  return str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parsePrice(value: FormDataEntryValue | null): number | null {
  const str = String(value ?? "").trim();
  if (!str) return null;
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}

function revalidateMenuPaths(id?: string) {
  revalidatePath("/menu");
  revalidatePath("/menu/manage");
  if (id) revalidatePath(`/menu/manage/${id}`);
}

/**
 * RLS on menu_items/menu_categories already enforces is_owner_admin() +
 * same-org-restaurant scoping -- these actions re-check up front purely so
 * the form can show a clean error instead of a raw Postgres RLS failure,
 * matching the vendor actions pattern.
 */
export async function createMenuItem(formData: FormData) {
  const { user, profile, restaurant, supabase } = await getCurrentProfile();
  if (!user || profile?.role !== "owner_admin" || !restaurant) {
    return { ok: false, error: "Not authorized." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { ok: false, error: "Item name is required." };
  }

  const { error } = await supabase.from("menu_items").insert({
    restaurant_id: restaurant.id,
    name,
    category_id: emptyToNull(formData.get("category_id")),
    price: parsePrice(formData.get("price")),
    pronunciation: emptyToNull(formData.get("pronunciation")),
    short_description: emptyToNull(formData.get("short_description")),
    guest_description: emptyToNull(formData.get("guest_description")),
    allergens: parseList(formData.get("allergens")),
    dietary_tags: parseList(formData.get("dietary_tags")),
    service_script: emptyToNull(formData.get("service_script")),
    pairings: emptyToNull(formData.get("pairings")),
    upsell_notes: emptyToNull(formData.get("upsell_notes")),
    is_86d: formData.get("is_86d") === "on",
    created_by: user.id,
  });

  if (error) return { ok: false, error: error.message };

  revalidateMenuPaths();
  return { ok: true };
}

export async function updateMenuItem(formData: FormData) {
  const { user, profile, restaurant, supabase } = await getCurrentProfile();
  if (!user || profile?.role !== "owner_admin" || !restaurant) {
    return { ok: false, error: "Not authorized." };
  }

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) {
    return { ok: false, error: "Item name is required." };
  }

  const { error } = await supabase
    .from("menu_items")
    .update({
      name,
      category_id: emptyToNull(formData.get("category_id")),
      price: parsePrice(formData.get("price")),
      pronunciation: emptyToNull(formData.get("pronunciation")),
      short_description: emptyToNull(formData.get("short_description")),
      guest_description: emptyToNull(formData.get("guest_description")),
      allergens: parseList(formData.get("allergens")),
      dietary_tags: parseList(formData.get("dietary_tags")),
      service_script: emptyToNull(formData.get("service_script")),
      pairings: emptyToNull(formData.get("pairings")),
      upsell_notes: emptyToNull(formData.get("upsell_notes")),
      is_86d: formData.get("is_86d") === "on",
      updated_by: user.id,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateMenuPaths(id);
  return { ok: true };
}

/** Plain-form-action wrapper: <form action={...}> requires a void-returning function. */
export async function setMenuItemEightySixedForm(formData: FormData): Promise<void> {
  await setMenuItemEightySixed(formData);
}

export async function setMenuItemEightySixed(formData: FormData) {
  const { user, profile, supabase } = await getCurrentProfile();
  if (!user || profile?.role !== "owner_admin") {
    return { ok: false, error: "Not authorized." };
  }

  const id = String(formData.get("id") ?? "");
  const is86d = formData.get("is_86d") === "true";
  if (!id) return { ok: false, error: "Missing item id." };

  const { error } = await supabase
    .from("menu_items")
    .update({ is_86d: is86d, updated_by: user.id })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateMenuPaths(id);
  return { ok: true };
}

export async function setMenuItemActiveForm(formData: FormData): Promise<void> {
  await setMenuItemActive(formData);
}

export async function setMenuItemActive(formData: FormData) {
  const { user, profile, supabase } = await getCurrentProfile();
  if (!user || profile?.role !== "owner_admin") {
    return { ok: false, error: "Not authorized." };
  }

  const id = String(formData.get("id") ?? "");
  const isActive = formData.get("is_active") === "true";
  if (!id) return { ok: false, error: "Missing item id." };

  const { error } = await supabase
    .from("menu_items")
    .update({ is_active: isActive, updated_by: user.id })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateMenuPaths(id);
  return { ok: true };
}

export async function createMenuCategory(formData: FormData) {
  const { user, profile, restaurant, supabase } = await getCurrentProfile();
  if (!user || profile?.role !== "owner_admin" || !restaurant) {
    return { ok: false, error: "Not authorized." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Category name is required." };

  const { error } = await supabase.from("menu_categories").insert({
    restaurant_id: restaurant.id,
    name,
  });

  if (error) return { ok: false, error: error.message };

  revalidateMenuPaths();
  return { ok: true };
}
