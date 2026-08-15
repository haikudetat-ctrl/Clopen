import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";
import { RosterFormClient } from "../roster-form-client";
import {
  setStaffActiveForm,
  linkStaffToProfileForm,
  removeAvailabilityForm,
} from "../actions";
import { AvailabilityFormClient } from "../availability-form-client";
import { DAY_LABELS, formatTime } from "@/lib/scheduling";

type StaffDetail = {
  id: string;
  name: string;
  roles: string[];
  skill_level: number;
  active: boolean;
  restaurant_id: string;
  user_id: string | null;
  profiles: { full_name: string | null; preferred_name: string | null } | null;
};

type AvailabilityRow = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

type EligibleProfile = {
  id: string;
  full_name: string | null;
  preferred_name: string | null;
};

export default async function StaffDetailPage({
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
          Sign in with a restaurant assigned to view this staff member.
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
            Roster is owner/admin only
          </h1>
        </main>
      </div>
    );
  }

  const { data: staffData } = await supabase
    .from("staff")
    .select(
      "id, name, roles, skill_level, active, restaurant_id, user_id, profiles(full_name, preferred_name)",
    )
    .eq("id", id)
    .maybeSingle();

  const staffMember = staffData as unknown as StaffDetail | null;

  if (!staffMember || staffMember.restaurant_id !== restaurant.id) {
    notFound();
  }

  const [{ data: availability }, { data: linkedStaff }, { data: allProfiles }] =
    await Promise.all([
      supabase
        .from("availability")
        .select("id, day_of_week, start_time, end_time")
        .eq("staff_id", staffMember.id)
        .order("day_of_week"),
      supabase
        .from("staff")
        .select("user_id")
        .eq("restaurant_id", restaurant.id)
        .not("user_id", "is", null),
      supabase
        .from("profiles")
        .select("id, full_name, preferred_name")
        .eq("restaurant_id", restaurant.id)
        .order("full_name"),
    ]);

  const availabilityRows: AvailabilityRow[] = availability ?? [];
  const linkedIds = new Set((linkedStaff ?? []).map((s) => s.user_id));
  const eligibleProfiles: EligibleProfile[] = (allProfiles ?? []).filter(
    (p) => !linkedIds.has(p.id),
  );
  const linkedProfile = staffMember.profiles;

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              {staffMember.name}
            </h1>
            <p className="text-sm text-zinc-500">
              {staffMember.active ? "Active" : "Inactive"} · Skill level{" "}
              {staffMember.skill_level}
            </p>
          </div>
          <Link
            href="/scheduling/roster"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
          >
            ← Roster
          </Link>
        </div>

        <RosterFormClient
          staff={{
            id: staffMember.id,
            name: staffMember.name,
            roles: staffMember.roles,
            skill_level: staffMember.skill_level,
          }}
        />

        <form action={setStaffActiveForm}>
          <input type="hidden" name="id" value={staffMember.id} />
          <input
            type="hidden"
            name="active"
            value={staffMember.active ? "false" : "true"}
          />
          <button
            type="submit"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
          >
            Mark as {staffMember.active ? "inactive" : "active"}
          </button>
        </form>

        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
            Login
          </h2>
          {staffMember.user_id ? (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-zinc-700">
                Linked to{" "}
                {linkedProfile?.preferred_name ||
                  linkedProfile?.full_name ||
                  "a login"}{" "}
                — they can see their own shifts and manage their own
                availability.
              </p>
              <form action={linkStaffToProfileForm}>
                <input type="hidden" name="staff_id" value={staffMember.id} />
                <input type="hidden" name="profile_id" value="" />
                <button
                  type="submit"
                  className="shrink-0 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
                >
                  Unlink
                </button>
              </form>
            </div>
          ) : (
            <form action={linkStaffToProfileForm} className="flex items-end gap-3">
              <input type="hidden" name="staff_id" value={staffMember.id} />
              <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-zinc-500">
                Link to a login
                <select
                  name="profile_id"
                  defaultValue=""
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                >
                  <option value="">Select a login…</option>
                  {eligibleProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.preferred_name || p.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={eligibleProfiles.length === 0}
                className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                Link
              </button>
            </form>
          )}
          {!staffMember.user_id && eligibleProfiles.length === 0 && (
            <p className="mt-2 text-xs text-zinc-400">
              No unlinked logins available in this restaurant.
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
            Availability
          </h2>
          <div className="mb-3 flex flex-col gap-2">
            {availabilityRows.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm"
              >
                <span className="text-zinc-900">
                  {DAY_LABELS[a.day_of_week] ?? a.day_of_week}
                </span>
                <span className="text-zinc-500">
                  {formatTime(a.start_time)} – {formatTime(a.end_time)}
                </span>
                <form action={removeAvailabilityForm}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="staff_id" value={staffMember.id} />
                  <button
                    type="submit"
                    className="text-xs font-medium text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </form>
              </div>
            ))}
            {availabilityRows.length === 0 && (
              <p className="text-sm text-zinc-400">No availability set yet.</p>
            )}
          </div>
          <AvailabilityFormClient staffId={staffMember.id} />
        </section>
      </main>
    </div>
  );
}
