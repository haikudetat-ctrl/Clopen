"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/current-profile";

function revalidateTemplatePaths() {
  revalidatePath("/scheduling/templates");
  revalidatePath("/scheduling/build");
  revalidatePath("/scheduling");
}

/**
 * RLS on shift_templates/shift_requirements already enforces owner_admin +
 * same-restaurant scoping -- these actions re-check up front purely so the
 * form can show a clean error instead of a raw Postgres RLS failure,
 * matching the vendor/shift-notes actions pattern.
 */
export async function createTemplate(formData: FormData) {
  const { user, profile, restaurant, supabase } = await getCurrentProfile();
  if (!user || profile?.role !== "owner_admin" || !restaurant) {
    return { ok: false, error: "Not authorized." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const startTime = String(formData.get("start_time") ?? "");
  const endTime = String(formData.get("end_time") ?? "");
  if (!name || !startTime || !endTime) {
    return { ok: false, error: "Name, start time, and end time are required." };
  }
  if (startTime >= endTime) {
    return { ok: false, error: "Start time must be before end time." };
  }

  const { error } = await supabase.from("shift_templates").insert({
    restaurant_id: restaurant.id,
    name,
    start_time: startTime,
    end_time: endTime,
  });

  if (error) return { ok: false, error: error.message };

  revalidateTemplatePaths();
  return { ok: true };
}

export async function updateTemplate(formData: FormData) {
  const { user, profile, supabase } = await getCurrentProfile();
  if (!user || profile?.role !== "owner_admin") {
    return { ok: false, error: "Not authorized." };
  }

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const startTime = String(formData.get("start_time") ?? "");
  const endTime = String(formData.get("end_time") ?? "");
  if (!id || !name || !startTime || !endTime) {
    return { ok: false, error: "Name, start time, and end time are required." };
  }
  if (startTime >= endTime) {
    return { ok: false, error: "Start time must be before end time." };
  }

  const { error } = await supabase
    .from("shift_templates")
    .update({ name, start_time: startTime, end_time: endTime })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateTemplatePaths();
  return { ok: true };
}

export async function deleteTemplateForm(formData: FormData): Promise<void> {
  await deleteTemplate(formData);
}

export async function deleteTemplate(formData: FormData) {
  const { user, profile, supabase } = await getCurrentProfile();
  if (!user || profile?.role !== "owner_admin") {
    return { ok: false, error: "Not authorized." };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing template id." };

  const { error } = await supabase.from("shift_templates").delete().eq("id", id);

  if (error) {
    return {
      ok: false,
      error: error.message.includes("foreign key constraint")
        ? "Can't delete — this template is already used in a published schedule."
        : error.message,
    };
  }

  revalidateTemplatePaths();
  return { ok: true };
}

export async function addRequirement(formData: FormData) {
  const { user, profile, supabase } = await getCurrentProfile();
  if (!user || profile?.role !== "owner_admin") {
    return { ok: false, error: "Not authorized." };
  }

  const templateId = String(formData.get("template_id") ?? "");
  const role = String(formData.get("role") ?? "").trim();
  const requiredCount = Number(formData.get("required_count") ?? "");
  if (!templateId || !role) {
    return { ok: false, error: "Role is required." };
  }
  if (!Number.isInteger(requiredCount) || requiredCount < 1) {
    return { ok: false, error: "Required count must be a whole number of at least 1." };
  }

  const { error } = await supabase.from("shift_requirements").insert({
    template_id: templateId,
    role,
    required_count: requiredCount,
  });

  if (error) return { ok: false, error: error.message };

  revalidateTemplatePaths();
  return { ok: true };
}

export async function updateRequirementForm(formData: FormData): Promise<void> {
  await updateRequirement(formData);
}

export async function updateRequirement(formData: FormData) {
  const { user, profile, supabase } = await getCurrentProfile();
  if (!user || profile?.role !== "owner_admin") {
    return { ok: false, error: "Not authorized." };
  }

  const id = String(formData.get("id") ?? "");
  const requiredCount = Number(formData.get("required_count") ?? "");
  if (!id) return { ok: false, error: "Missing requirement id." };
  if (!Number.isInteger(requiredCount) || requiredCount < 1) {
    return { ok: false, error: "Required count must be a whole number of at least 1." };
  }

  const { error } = await supabase
    .from("shift_requirements")
    .update({ required_count: requiredCount })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateTemplatePaths();
  return { ok: true };
}

export async function removeRequirementForm(formData: FormData): Promise<void> {
  await removeRequirement(formData);
}

export async function removeRequirement(formData: FormData) {
  const { user, profile, supabase } = await getCurrentProfile();
  if (!user || profile?.role !== "owner_admin") {
    return { ok: false, error: "Not authorized." };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing requirement id." };

  const { error } = await supabase.from("shift_requirements").delete().eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateTemplatePaths();
  return { ok: true };
}
