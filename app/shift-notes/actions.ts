"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/current-profile";
import { canManageScope } from "@/lib/shift-notes";

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const str = String(value ?? "").trim();
  return str === "" ? null : str;
}

/**
 * RLS already enforces exactly this rule (owner_admin: any note_scope;
 * head_bartender: only note_scope in bar/wine/spirits, via
 * can_manage_bar_note()) -- these actions re-check up front purely so the
 * form can show a clean error instead of a raw Postgres RLS failure,
 * matching the vendor/menu actions pattern.
 */
export async function createShiftNote(formData: FormData) {
  const { user, profile, restaurant, supabase } = await getCurrentProfile();
  if (!user || !restaurant) {
    return { ok: false, error: "Not authorized." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const serviceDate = String(formData.get("service_date") ?? "").trim();
  const noteScope = String(formData.get("note_scope") ?? "general").trim();

  if (!title || !body || !serviceDate) {
    return { ok: false, error: "Title, body, and service date are required." };
  }
  if (!canManageScope(profile?.role, noteScope)) {
    return {
      ok: false,
      error:
        profile?.role === "head_bartender"
          ? "You can only post notes scoped to bar, wine, or spirits."
          : "Not authorized to post shift notes.",
    };
  }

  const { error } = await supabase.from("shift_notes").insert({
    restaurant_id: restaurant.id,
    title,
    body,
    service_date: serviceDate,
    shift_type: emptyToNull(formData.get("shift_type")),
    note_scope: noteScope,
    priority: String(formData.get("priority") ?? "normal"),
    is_pinned: formData.get("is_pinned") === "on",
    expires_at: emptyToNull(formData.get("expires_at")),
    created_by: user.id,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/shift-notes");
  return { ok: true };
}

export async function updateShiftNote(formData: FormData) {
  const { user, profile, restaurant, supabase } = await getCurrentProfile();
  if (!user || !restaurant) {
    return { ok: false, error: "Not authorized." };
  }

  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const serviceDate = String(formData.get("service_date") ?? "").trim();
  const noteScope = String(formData.get("note_scope") ?? "general").trim();

  if (!id || !title || !body || !serviceDate) {
    return { ok: false, error: "Title, body, and service date are required." };
  }
  if (!canManageScope(profile?.role, noteScope)) {
    return {
      ok: false,
      error:
        profile?.role === "head_bartender"
          ? "You can only manage notes scoped to bar, wine, or spirits."
          : "Not authorized to edit this note.",
    };
  }

  const { error } = await supabase
    .from("shift_notes")
    .update({
      title,
      body,
      service_date: serviceDate,
      shift_type: emptyToNull(formData.get("shift_type")),
      note_scope: noteScope,
      priority: String(formData.get("priority") ?? "normal"),
      is_pinned: formData.get("is_pinned") === "on",
      expires_at: emptyToNull(formData.get("expires_at")),
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/shift-notes");
  return { ok: true };
}

/** Plain-form-action wrapper: <form action={...}> requires a void-returning function. */
export async function setShiftNotePinnedForm(formData: FormData): Promise<void> {
  await setShiftNotePinned(formData);
}

export async function setShiftNotePinned(formData: FormData) {
  const { user, profile, supabase } = await getCurrentProfile();
  if (!user) return { ok: false, error: "Not authorized." };

  const id = String(formData.get("id") ?? "");
  const noteScope = String(formData.get("note_scope") ?? "");
  const isPinned = formData.get("is_pinned") === "true";
  if (!id) return { ok: false, error: "Missing note id." };
  if (!canManageScope(profile?.role, noteScope)) {
    return { ok: false, error: "Not authorized to manage this note." };
  }

  const { error } = await supabase
    .from("shift_notes")
    .update({ is_pinned: isPinned })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/shift-notes");
  return { ok: true };
}

export async function setShiftNoteActiveForm(formData: FormData): Promise<void> {
  await setShiftNoteActive(formData);
}

export async function setShiftNoteActive(formData: FormData) {
  const { user, profile, supabase } = await getCurrentProfile();
  if (!user) return { ok: false, error: "Not authorized." };

  const id = String(formData.get("id") ?? "");
  const noteScope = String(formData.get("note_scope") ?? "");
  const isActive = formData.get("is_active") === "true";
  if (!id) return { ok: false, error: "Missing note id." };
  if (!canManageScope(profile?.role, noteScope)) {
    return { ok: false, error: "Not authorized to manage this note." };
  }

  const { error } = await supabase
    .from("shift_notes")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/shift-notes");
  return { ok: true };
}
