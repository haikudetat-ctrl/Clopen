"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/current-profile";
import { parseRoles } from "@/lib/scheduling";
import type { createClient } from "@/lib/supabase/server";

function revalidateRosterPaths(id?: string) {
  revalidatePath("/scheduling/roster");
  if (id) revalidatePath(`/scheduling/roster/${id}`);
  revalidatePath("/scheduling");
  revalidatePath("/scheduling/my-availability");
}

/**
 * RLS on staff/availability already enforces owner_admin (or, for
 * availability, the linked staff member themselves via
 * availability_self_manage from 00033_staff_user_link.sql) -- these actions
 * re-check up front purely so the form can show a clean error instead of a
 * raw Postgres RLS failure, matching the vendor/shift-notes actions
 * pattern.
 */
export async function createStaff(formData: FormData) {
  const { user, profile, restaurant, supabase } = await getCurrentProfile();
  if (!user || profile?.role !== "owner_admin" || !restaurant) {
    return { ok: false, error: "Not authorized." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const skillLevel = Number(formData.get("skill_level") ?? "");
  if (!name) return { ok: false, error: "Name is required." };
  if (!Number.isFinite(skillLevel)) {
    return { ok: false, error: "Skill level must be a number." };
  }

  const { error } = await supabase.from("staff").insert({
    restaurant_id: restaurant.id,
    name,
    roles: parseRoles(formData.get("roles")),
    skill_level: skillLevel,
  });

  if (error) return { ok: false, error: error.message };

  revalidateRosterPaths();
  return { ok: true };
}

export async function updateStaff(formData: FormData) {
  const { user, profile, supabase } = await getCurrentProfile();
  if (!user || profile?.role !== "owner_admin") {
    return { ok: false, error: "Not authorized." };
  }

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const skillLevel = Number(formData.get("skill_level") ?? "");
  if (!id || !name) return { ok: false, error: "Name is required." };
  if (!Number.isFinite(skillLevel)) {
    return { ok: false, error: "Skill level must be a number." };
  }

  const { error } = await supabase
    .from("staff")
    .update({
      name,
      roles: parseRoles(formData.get("roles")),
      skill_level: skillLevel,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateRosterPaths(id);
  return { ok: true };
}

/** Plain-form-action wrapper: <form action={...}> requires a void-returning function. */
export async function setStaffActiveForm(formData: FormData): Promise<void> {
  await setStaffActive(formData);
}

export async function setStaffActive(formData: FormData) {
  const { user, profile, supabase } = await getCurrentProfile();
  if (!user || profile?.role !== "owner_admin") {
    return { ok: false, error: "Not authorized." };
  }

  const id = String(formData.get("id") ?? "");
  const isActive = formData.get("active") === "true";
  if (!id) return { ok: false, error: "Missing staff id." };

  const { error } = await supabase
    .from("staff")
    .update({ active: isActive })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateRosterPaths(id);
  return { ok: true };
}

/**
 * Links (or, when profile_id is blank, unlinks) a staff row to a login so
 * that person can sign in and see their own shifts / manage their own
 * availability. See 00033_staff_user_link.sql.
 */
export async function linkStaffToProfileForm(formData: FormData): Promise<void> {
  await linkStaffToProfile(formData);
}

export async function linkStaffToProfile(formData: FormData) {
  const { user, profile, restaurant, supabase } = await getCurrentProfile();
  if (!user || profile?.role !== "owner_admin" || !restaurant) {
    return { ok: false, error: "Not authorized." };
  }

  const staffId = String(formData.get("staff_id") ?? "");
  const profileId = String(formData.get("profile_id") ?? "").trim();
  if (!staffId) return { ok: false, error: "Missing staff id." };

  if (profileId) {
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("id, restaurant_id")
      .eq("id", profileId)
      .maybeSingle();
    if (!targetProfile || targetProfile.restaurant_id !== restaurant.id) {
      return { ok: false, error: "That login isn't part of this restaurant." };
    }
  }

  const { error } = await supabase
    .from("staff")
    .update({ user_id: profileId || null })
    .eq("id", staffId);

  if (error) {
    return {
      ok: false,
      error: error.message.includes("staff_user_id_key")
        ? "That login is already linked to another staff member."
        : error.message,
    };
  }

  revalidateRosterPaths(staffId);
  return { ok: true };
}

/**
 * Authorized for either the owner_admin, or the linked staff member
 * managing their own availability (mirrors RLS's availability_self_manage
 * policy) -- one extra query beyond what RLS already checks, purely so a
 * mismatched attempt gets a clean error message instead of a raw failure.
 */
async function canManageAvailability(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  role: string | null | undefined,
  staffId: string,
): Promise<boolean> {
  if (role === "owner_admin") return true;
  const { data } = await supabase
    .from("staff")
    .select("id")
    .eq("id", staffId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

export async function addAvailability(formData: FormData) {
  const { user, profile, supabase } = await getCurrentProfile();
  if (!user) return { ok: false, error: "Not authorized." };

  const staffId = String(formData.get("staff_id") ?? "");
  const dayOfWeek = Number(formData.get("day_of_week") ?? "");
  const startTime = String(formData.get("start_time") ?? "");
  const endTime = String(formData.get("end_time") ?? "");

  if (!staffId || !Number.isInteger(dayOfWeek) || !startTime || !endTime) {
    return { ok: false, error: "Day, start time, and end time are required." };
  }
  if (startTime >= endTime) {
    return { ok: false, error: "Start time must be before end time." };
  }
  if (!(await canManageAvailability(supabase, user.id, profile?.role, staffId))) {
    return {
      ok: false,
      error: "Not authorized to manage this staff member's availability.",
    };
  }

  const { error } = await supabase.from("availability").insert({
    staff_id: staffId,
    day_of_week: dayOfWeek,
    start_time: startTime,
    end_time: endTime,
  });

  if (error) return { ok: false, error: error.message };

  revalidateRosterPaths(staffId);
  return { ok: true };
}

export async function removeAvailabilityForm(formData: FormData): Promise<void> {
  await removeAvailability(formData);
}

export async function removeAvailability(formData: FormData) {
  const { user, profile, supabase } = await getCurrentProfile();
  if (!user) return { ok: false, error: "Not authorized." };

  const id = String(formData.get("id") ?? "");
  const staffId = String(formData.get("staff_id") ?? "");
  if (!id || !staffId) return { ok: false, error: "Missing availability id." };
  if (!(await canManageAvailability(supabase, user.id, profile?.role, staffId))) {
    return {
      ok: false,
      error: "Not authorized to manage this staff member's availability.",
    };
  }

  const { error } = await supabase.from("availability").delete().eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateRosterPaths(staffId);
  return { ok: true };
}
