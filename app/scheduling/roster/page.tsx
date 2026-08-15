import Link from "next/link";
import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";
import { RosterFormClient } from "./roster-form-client";
import { formatRoles } from "@/lib/scheduling";

type StaffRow = {
  id: string;
  name: string;
  roles: string[];
  skill_level: number;
  active: boolean;
  user_id: string | null;
};

export default async function RosterPage() {
  const { user, profile, restaurant, supabase } = await getCurrentProfile();

  if (!user || !restaurant) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-zinc-500">
          Sign in with a restaurant assigned to view the roster.
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

  const { data: staff } = await supabase
    .from("staff")
    .select("id, name, roles, skill_level, active, user_id")
    .eq("restaurant_id", restaurant.id)
    .order("name");

  const staffRows: StaffRow[] = staff ?? [];

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Roster</h1>
            <p className="text-sm text-zinc-500">{restaurant.name}</p>
          </div>
          <Link
            href="/scheduling"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
          >
            ← Scheduling
          </Link>
        </div>

        <RosterFormClient />

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-400">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Job roles</th>
                <th className="px-4 py-3 text-right font-medium">
                  Skill level
                </th>
                <th className="px-4 py-3 font-medium">Login</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {staffRows.map((s) => (
                <tr key={s.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/scheduling/roster/${s.id}`}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500">
                    {formatRoles(s.roles) || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-700">
                    {s.skill_level}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500">
                    {s.user_id ? "Linked" : "Not linked"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        s.active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {s.active ? "active" : "inactive"}
                    </span>
                  </td>
                </tr>
              ))}
              {staffRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                    No staff on the roster yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
