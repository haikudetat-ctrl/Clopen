/**
 * Shared scheduling constants/helpers used by the roster, shift-template,
 * and schedule-builder pages/actions. Kept out of actions.ts files because
 * a "use server" file may only export async actions -- a plain sync helper
 * can't live there (mirrors lib/shift-notes.ts).
 *
 * Day convention: `schedule_assignments.day` (and DAY_LABELS below) is
 * Monday = 0 ... Sunday = 6, matching how the DB derives an assignment's
 * calendar date (`week_start + day`, where week_start is always a Monday --
 * see 00026_fix_schedules_week_start_scope.sql and the GL labor-cost
 * functions in 00019/00025). This is the OPPOSITE of JS's
 * Date.prototype.getDay() (Sunday = 0), so don't reach for getDay() when
 * indexing into `day` -- add `day` to `week_start` instead, same as the SQL
 * does. All the date helpers below follow that same "add days to
 * week_start" approach rather than reasoning from weekday names.
 */

export const DAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const DAY_LABELS_SHORT = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;

/** Monday (as an ISO yyyy-mm-dd string) of the week containing `date`. */
export function getMondayIso(date: Date = new Date()): string {
  const d = new Date(date);
  const jsDay = d.getDay(); // Sunday = 0 in JS
  const mondayOffset = (jsDay + 6) % 7; // days since the most recent Monday
  d.setDate(d.getDate() - mondayOffset);
  return d.toISOString().slice(0, 10);
}

/** ISO date of the Monday `deltaWeeks` weeks away from `weekStartIso` (negative goes back). */
export function shiftWeek(weekStartIso: string, deltaWeeks: number): string {
  const d = new Date(weekStartIso + "T00:00:00");
  d.setDate(d.getDate() + deltaWeeks * 7);
  return d.toISOString().slice(0, 10);
}

/** The calendar date (ISO yyyy-mm-dd) for a given `day` (0=Mon..6=Sun) within a week. */
export function dateForDay(weekStartIso: string, day: number): string {
  const d = new Date(weekStartIso + "T00:00:00");
  d.setDate(d.getDate() + day);
  return d.toISOString().slice(0, 10);
}

/** "Mon, Jan 5" style label for a given day offset within a week. */
export function dayDateLabel(weekStartIso: string, day: number): string {
  const iso = dateForDay(weekStartIso, day);
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "Jan 5 - Jan 11, 2026" style label for the whole week. */
export function formatWeekRange(weekStartIso: string): string {
  const start = new Date(weekStartIso + "T00:00:00");
  const end = new Date(weekStartIso + "T00:00:00");
  end.setDate(end.getDate() + 6);
  const startLabel = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const endLabel = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${startLabel} – ${endLabel}`;
}

/** Comma-separated input -> trimmed string[], e.g. staff job roles. Mirrors app/menu/actions.ts's parseList. */
export function parseRoles(value: FormDataEntryValue | null): string[] {
  const str = String(value ?? "").trim();
  if (!str) return [];
  return str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatRoles(roles: string[] | null | undefined): string {
  return (roles ?? []).join(", ");
}

/** "HH:MM" (24h, from a DB `time` value) -> "5:00 PM" for display. */
export function formatTime(time: string): string {
  const [hh, mm] = time.split(":");
  const d = new Date();
  d.setHours(Number(hh), Number(mm), 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
