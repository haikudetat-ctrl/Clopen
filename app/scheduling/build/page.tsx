import Link from "next/link";
import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";
import { createScheduleForm, removeAssignmentForm } from "./actions";
import { AssignSlotClient } from "./assign-slot-client";
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

type StaffRow = { id: string; name: string; roles: string[] };

type AssignmentRow = {
  id: string;
  day: number;
  template_id: string;
  role: string;
  staff_id: string | null;
  staff: { name: string } | null;
};

export default async function BuildSchedulePage({
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
          Sign in with a restaurant assigned to build a schedule.
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
            Building schedules is owner/admin only
          </h1>
        </main>
      </div>
    );
  }

  const weekStart =
    week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : getMondayIso();
  const prevWeek = shiftWeek(weekStart, -1);
  const nextWeek = shiftWeek(weekStart, 1);

  const [{ data: schedule }, { data: templates }, { data: staff }] =
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
        .select("id, name, roles, active")
        .eq("restaurant_id", restaurant.id)
        .eq("active", true)
        .order("name"),
    ]);

  const templateRows: TemplateRow[] = templates ?? [];
  const templateIds = templateRows.map((t) => t.id);
  const staffRows: StaffRow[] = staff ?? [];

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
              Build schedule
            </h1>
            <p className="text-sm text-zinc-500">{restaurant.name}</p>
          </div>
          <Link
            href="/scheduling"
            className="shrink-0 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
          >
            ← Scheduling
          </Link>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-5 py-3">
          <Link
            href={`/scheduling/build?week=${prevWeek}`}
            className="text-sm text-zinc-500 hover:text-zinc-900"
          >
            ← Prev week
          </Link>
          <span className="text-sm font-medium text-zinc-900">
            {formatWeekRange(weekStart)}
          </span>
          <Link
            href={`/scheduling/build?week=${nextWeek}`}
            className="text-sm text-zinc-500 hover:text-zinc-900"
          >
            Next week →
          </Link>
        </div>

        {templateRows.length === 0 && (
          <p className="text-sm text-zinc-500">
            No shift templates yet —{" "}
            <Link href="/scheduling/templates" className="underline">
              add one
            </Link>{" "}
            before building a schedule.
          </p>
        )}

        {!schedule && templateRows.length > 0 && (
          <form action={createScheduleForm}>
            <input type="hidden" name="week_start" value={weekStart} />
            <button
              type="submit"
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Create schedule for this week
            </button>
          </form>
        )}

        {schedule &&
          DAY_LABELS.map((dayLabel, day) => (
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
                      <div className="flex flex-col gap-2">
                        {reqs.map((r) => {
                          const key = `${day}:${t.id}:${r.role}`;
                          const filled = (
                            assignmentsByKey.get(key) ?? []
                          ).filter((a) => a.staff_id);
                          const isFull = filled.length >= r.required_count;
                          const qualifiedStaff = staffRows.filter((s) =>
                            s.roles.includes(r.role),
                          );
                          return (
                            <div
                              key={r.id}
                              className="flex flex-wrap items-center gap-2 text-sm"
                            >
                              <span className="w-28 shrink-0 text-zinc-500">
                                {r.role} ({filled.length}/{r.required_count})
                              </span>
                              {filled.map((a) => (
                                <span
                                  key={a.id}
                                  className="flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700"
                                >
                                  {a.staff?.name ?? "Unknown"}
                                  <form action={removeAssignmentForm}>
                                    <input type="hidden" name="id" value={a.id} />
                                    <button
                                      type="submit"
                                      className="ml-1 text-zinc-400 hover:text-red-600"
                                      aria-label={`Remove ${a.staff?.name ?? "staff"}`}
                                    >
                                      ×
                                    </button>
                                  </form>
                                </span>
                              ))}
                              {isFull ? (
                                <span className="text-xs text-emerald-600">
                                  fully staffed
                                </span>
                              ) : (
                                <AssignSlotClient
                                  scheduleId={schedule.id}
                                  day={day}
                                  templateId={t.id}
                                  role={r.role}
                                  requiredCount={r.required_count}
                                  qualifiedStaff={qualifiedStaff}
                                  allStaff={staffRows}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
      </main>
    </div>
  );
}
