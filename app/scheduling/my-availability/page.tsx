import Link from "next/link";
import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";
import { removeAvailabilityForm } from "../roster/actions";
import { AvailabilityFormClient } from "../roster/availability-form-client";
import { DAY_LABELS, formatTime } from "@/lib/scheduling";

type AvailabilityRow = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

export default async function MyAvailabilityPage() {
  const { user, restaurant, supabase } = await getCurrentProfile();

  if (!user || !restaurant) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-zinc-500">
          {user
            ? "No restaurant assigned yet."
            : "Sign in to manage your availability."}
        </main>
      </div>
    );
  }

  const { data: myStaff } = await supabase
    .from("staff")
    .select("id, name")
    .eq("restaurant_id", restaurant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!myStaff) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h1 className="text-xl font-semibold text-zinc-900">
            Not linked to a staff profile yet
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Ask an owner or admin to link your login to a roster entry before
            you can set your own availability.
          </p>
        </main>
      </div>
    );
  }

  const { data: availability } = await supabase
    .from("availability")
    .select("id, day_of_week, start_time, end_time")
    .eq("staff_id", myStaff.id)
    .order("day_of_week");

  const availabilityRows: AvailabilityRow[] = availability ?? [];

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              My availability
            </h1>
            <p className="text-sm text-zinc-500">
              {myStaff.name} · {restaurant.name}
            </p>
          </div>
          <Link
            href="/scheduling"
            className="shrink-0 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
          >
            ← Scheduling
          </Link>
        </div>

        <div className="flex flex-col gap-2">
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
                <input type="hidden" name="staff_id" value={myStaff.id} />
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
            <p className="text-sm text-zinc-400">
              You haven&apos;t set any availability yet.
            </p>
          )}
        </div>

        <AvailabilityFormClient staffId={myStaff.id} />
      </main>
    </div>
  );
}
