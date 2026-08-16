import Link from "next/link";
import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";
import {
  DAY_LABELS,
  dayDateLabel,
  formatWeekRange,
  formatTime,
  getMondayIso,
  shiftWeek,
} from "@/lib/scheduling";

type TemplateRow = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
};

type RequirementRow = {
  id: string;
  template_id: string;
  role: string;
  required_count: number;
};

type AssignmentRow = {
  id: string;
  day: number;
  template_id: string;
  role: string;
  staff_id: string | null;
  staff: { name: string } | null;
};

export default async function SchedulingPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const { user, profile, restaurant, supabase } = await getCurrentProfile();

  if (!user || !restaurant) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-zinc-500">
          {user
            ? "No restaurant assigned yet."
            : "Sign in to view the schedule."}
        </main>
      </div>
    );
  }

  const isOwnerAdmin = profile?.role === "owner_admin";
  const weekStart =
    week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : getMondayIso();
  const prevWeek = shiftWeek(weekStart, -1);
  const nextWeek = shiftWeek(weekStart, 1);

  const [{ data: schedule }, { data: templates }, { data: myStaff }] =
    await Promise.all([
      supabase
        .from("schedules")
        .select("id")
        .eq("restaurant_id", restaurant.id)
        .eq("week_start", weekStart)
        .maybeSingle(),
      supabase
        .from("shift_templates")
        .select("id, name, start_time, end_time")
        .eq("restaurant_id", restaurant.id)
        .order("start_time"),
      supabase
        .from("staff")
        .select("id")
        .eq("restaurant_id", restaurant.id)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  const templateRows: TemplateRow[] = templates ?? [];
  const templateIds = templateRows.map((t) => t.id);
  const myStaffId = myStaff?.id ?? null;

  const { data: requirements } =
    templateIds.length > 0
      ? await supabase
          .from("shift_requirements")
          .select("id, template_id, role, required_count")
          .in("template_id", templateIds)
      : { data: [] };
  const requirementRows: RequirementRow[] = requirements ?? [];
  const requirementsByTemplate = new Map<string, RequirementRow[]>();
  for (const r of requirementRows) {
    const list = requirementsByTemplate.get(r.template_id) ?? [];
    list.push(r);
    requirementsByTemplate.set(r.template_id, list);
  }

  let assignmentRows: AssignmentRow[] = [];
  if (schedule) {
    const { data: assignments } = await supabase
      .from("schedule_assignments")
      .select("id, day, template_id, role, staff_id, staff(name)")
      .eq("schedule_id", schedule.id);
    assignmentRows = (assignments ?? []) as unknown as AssignmentRow[];
  }

  const assignmentsByKey = new Map<string, AssignmentRow[]>();
  for (const a of assignmentRows) {
    const key = `${a.day}:${a.template_id}:${a.role}`;
    const list = assignmentsByKey.get(key) ?? [];
    list.push(a);
    assignmentsByKey.set(key, list);
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              Scheduling
            </h1>
            <p className="text-sm text-zinc-500">{restaurant.name}</p>
          </div>
          {isOwnerAdmin && (
            <div className="flex gap-3">
              <Link
                href="/scheduling/roster"
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
              >
                Roster
              </Link>
              <Link
                href="/scheduling/templates"
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
              >
                Shift templates
              </Link>
              <Link
                href="/scheduling/build"
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
              >
                Build schedule
              </Link>
            </div>
          )}
        </div>

        {myStaffId && (
          <p className="text-sm text-zinc-500">
            Your shifts below are highlighted. Want to update when you&apos;re
            free to work?{" "}
            <Link href="/scheduling/my-availability" className="underline">
              Set your availability
            </Link>
            .
          </p>
        )}

        <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-5 py-3">
          <Link
            href={`/scheduling?week=${prevWeek}`}
            className="text-sm text-zinc-500 hover:text-zinc-900"
          >
            ← Prev week
          </Link>
          <span className="text-sm font-medium text-zinc-900">
            {formatWeekRange(weekStart)}
          </span>
          <Link
            href={`/scheduling?week=${nextWeek}`}
            className="text-sm text-zinc-500 hover:text-zinc-900"
          >
            Next week →
          </Link>
        </div>

        {!schedule && (
          <p className="text-sm text-zinc-500">
            {isOwnerAdmin ? (
              <>
                No schedule for this week yet —{" "}
                <Link href={`/scheduling/build?week=${weekStart}`} className="underline">
                  build one
                </Link>
                .
              </>
            ) : (
              "No schedule has been published for this week yet."
            )}
          </p>
        )}

        {schedule &&
          DAY_LABELS.map((dayLabel, day) => {
            const dayHasAnyRequirement = templateRows.some(
              (t) => (requirementsByTemplate.get(t.id) ?? []).length > 0,
            );
            if (!dayHasAnyRequirement) return null;
            return (
              <section
                key={dayLabel}
                className="overflow-hidden rounded-xl border border-zinc-200 bg-white"
              >
                <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-2.5 text-sm font-semibold text-zinc-900">
                  {dayLabel} — {dayDateLabel(weekStart, day)}
                </div>
                <div className="flex flex-col divide-y divide-zinc-100">
                  {templateRows.map((t) => {
                    const reqs = requirementsByTemplate.get(t.id) ?? [];
                    if (reqs.length === 0) return null;
                    return (
                      <div key={t.id} className="px-5 py-4">
                        <div className="mb-2 text-sm font-medium text-zinc-900">
                          {t.name}{" "}
                          <span className="font-normal text-zinc-400">
                            {formatTime(t.start_time)}–{formatTime(t.end_time)}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {reqs.map((r) => {
                            const key = `${day}:${t.id}:${r.role}`;
                            const filled = (
                              assignmentsByKey.get(key) ?? []
                            ).filter((a) => a.staff_id);
                            return (
                              <div
                                key={r.id}
                                className="flex flex-wrap items-center gap-2 text-sm"
                              >
                                <span className="w-28 shrink-0 text-zinc-500">
                                  {r.role} ({filled.length}/{r.required_count})
                                </span>
                                {filled.length === 0 && (
                                  <span className="text-xs text-amber-600">
                                    open
                                  </span>
                                )}
                                {filled.map((a) => {
                                  const isMe = a.staff_id === myStaffId;
                                  return (
                                    <span
                                      key={a.id}
                                      className={`rounded-full px-2.5 py-1 text-xs ${
                                        isMe
                                          ? "bg-zinc-900 text-white"
                                          : "bg-zinc-100 text-zinc-700"
                                      }`}
                                    >
                                      {a.staff?.name ?? "Unknown"}
                                      {isMe && " (you)"}
                                    </span>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
      </main>
    </div>
  );
}
