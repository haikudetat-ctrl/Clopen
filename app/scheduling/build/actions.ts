"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/current-profile";

function revalidateBuildPaths() {
  revalidatePath("/scheduling/build");
  revalidatePath("/scheduling");
}

/**
 * RLS on schedules/schedule_assignments already enforces owner_admin +
 * same-restaurant scoping -- these actions re-check up front purely so the
 * form can show a clean error instead of a raw Postgres RLS failure,
 * matching the vendor/shift-notes actions pattern.
 */
export async function createScheduleForm(formData: FormData): Promise<void> {
  await createSchedule(formData);
}

export async function createSchedule(formData: FormData) {
  const { user, profile, restaurant, supabase } = await getCurrentProfile();
  if (!user || profile?.role !== "owner_admin" || !restaurant) {
    return { ok: false, error: "Not authorized." };
  }

  const weekStart = String(formData.get("week_start") ?? "");
  if (!weekStart) return { ok: false, error: "Missing week." };

  const { error } = await supabase.from("schedules").insert({
    restaurant_id: restaurant.id,
    week_start: weekStart,
  });

  if (error && !error.message.includes("schedules_restaurant_week_start_key")) {
    return { ok: false, error: error.message };
  }

  revalidateBuildPaths();
  return { ok: true };
}

export async function assignStaff(formData: FormData) {
  const { user, profile, supabase } = await getCurrentProfile();
  if (!user || profile?.role !== "owner_admin") {
    return { ok: false, error: "Not authorized." };
  }

  const scheduleId = String(formData.get("schedule_id") ?? "");
  const day = Number(formData.get("day") ?? "");
  const templateId = String(formData.get("template_id") ?? "");
  const role = String(formData.get("role") ?? "");
  const staffId = String(formData.get("staff_id") ?? "");
  const requiredCount = Number(formData.get("required_count") ?? "");

  if (!scheduleId || !Number.isInteger(day) || !templateId || !role || !staffId) {
    return { ok: false, error: "Pick a staff member to assign." };
  }

  // Belt-and-suspenders check against a stale/concurrently-filled slot --
  // the UI already hides the assign form once a role is fully staffed, but
  // two owners editing the same schedule at once could both submit before
  // either page refreshes.
  if (Number.isFinite(requiredCount)) {
    const { count } = await supabase
      .from("schedule_assignments")
      .select("id", { count: "exact", head: true })
      .eq("schedule_id", scheduleId)
      .eq("day", day)
      .eq("template_id", templateId)
      .eq("role", role);
    if ((count ?? 0) >= requiredCount) {
      return { ok: false, error: "This role is already fully staffed for this shift." };
    }
  }

  const { error } = await supabase.from("schedule_assignments").insert({
    schedule_id: scheduleId,
    day,
    template_id: templateId,
    role,
    staff_id: staffId,
  });

  if (error) return { ok: false, error: error.message };

  revalidateBuildPaths();
  return { ok: true };
}

export async function removeAssignmentForm(formData: FormData): Promise<void> {
  await removeAssignment(formData);
}

export async function removeAssignment(formData: FormData) {
  const { user, profile, supabase } = await getCurrentProfile();
  if (!user || profile?.role !== "owner_admin") {
    return { ok: false, error: "Not authorized." };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing assignment id." };

  const { error } = await supabase.from("schedule_assignments").delete().eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateBuildPaths();
  return { ok: true };
}
