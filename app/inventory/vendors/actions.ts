"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/current-profile";

/**
 * RLS on vendors/vendor_items already enforces can_manage_inventory_catalog()
 * (owner_admin) plus organization scoping -- these actions re-check the same
 * thing up front purely so the form can show a clean error instead of a raw
 * Postgres RLS failure, not because RLS can't be trusted on its own.
 */
export async function createVendor(formData: FormData) {
  const { user, profile, restaurant, supabase } = await getCurrentProfile();
  if (!user || profile?.role !== "owner_admin" || !restaurant?.organization_id) {
    return { ok: false, error: "Not authorized." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { ok: false, error: "Vendor name is required." };
  }

  const { error } = await supabase.from("vendors").insert({
    organization_id: restaurant.organization_id,
    name,
    contact_name: emptyToNull(formData.get("contact_name")),
    contact_email: emptyToNull(formData.get("contact_email")),
    contact_phone: emptyToNull(formData.get("contact_phone")),
    account_number: emptyToNull(formData.get("account_number")),
    payment_terms: emptyToNull(formData.get("payment_terms")),
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/inventory/vendors");
  return { ok: true };
}

export async function updateVendor(formData: FormData) {
  const { user, profile, restaurant, supabase } = await getCurrentProfile();
  if (!user || profile?.role !== "owner_admin" || !restaurant?.organization_id) {
    return { ok: false, error: "Not authorized." };
  }

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) {
    return { ok: false, error: "Vendor name is required." };
  }

  const { error } = await supabase
    .from("vendors")
    .update({
      name,
      contact_name: emptyToNull(formData.get("contact_name")),
      contact_email: emptyToNull(formData.get("contact_email")),
      contact_phone: emptyToNull(formData.get("contact_phone")),
      account_number: emptyToNull(formData.get("account_number")),
      payment_terms: emptyToNull(formData.get("payment_terms")),
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/inventory/vendors");
  revalidatePath(`/inventory/vendors/${id}`);
  return { ok: true };
}

/** Plain-form-action wrapper: <form action={...}> requires a void-returning function. */
export async function setVendorActiveForm(formData: FormData): Promise<void> {
  await setVendorActive(formData);
}

export async function setVendorActive(formData: FormData) {
  const { user, profile, supabase } = await getCurrentProfile();
  if (!user || profile?.role !== "owner_admin") {
    return { ok: false, error: "Not authorized." };
  }

  const id = String(formData.get("id") ?? "");
  const isActive = formData.get("is_active") === "true";
  if (!id) return { ok: false, error: "Missing vendor id." };

  const { error } = await supabase
    .from("vendors")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/inventory/vendors");
  revalidatePath(`/inventory/vendors/${id}`);
  return { ok: true };
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const str = String(value ?? "").trim();
  return str === "" ? null : str;
}
