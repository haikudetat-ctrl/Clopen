/**
 * Shared shift-note constants/helpers used by both the server actions and
 * the page component. Kept out of actions.ts because a "use server" file
 * may only export async actions -- a plain sync helper can't live there.
 *
 * Mirrors the DB check constraints (see shift_notes_note_scope_check,
 * shift_notes_priority_check, shift_notes_shift_type_check) and the RLS
 * policies (can_manage_bar_note()): owner_admin can manage any note_scope;
 * head_bartender can only manage bar/wine/spirits-scoped notes; everyone
 * else is read + acknowledge only.
 */

export const NOTE_SCOPES_ALL = [
  "general",
  "service",
  "bar",
  "wine",
  "spirits",
  "training",
  "urgent",
] as const;

export const BAR_SCOPES = ["bar", "wine", "spirits"] as const;

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export const SHIFT_TYPES = [
  "lunch",
  "dinner",
  "brunch",
  "double",
  "event",
  "all_day",
] as const;

export function canManageScope(
  role: string | null | undefined,
  scope: string,
): boolean {
  if (role === "owner_admin") return true;
  if (role === "head_bartender") return (BAR_SCOPES as readonly string[]).includes(scope);
  return false;
}

export function scopesForRole(role: string | null | undefined): readonly string[] {
  if (role === "owner_admin") return NOTE_SCOPES_ALL;
  if (role === "head_bartender") return BAR_SCOPES;
  return [];
}
