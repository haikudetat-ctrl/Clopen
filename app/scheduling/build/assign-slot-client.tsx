"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignStaff } from "./actions";

type StaffOption = { id: string; name: string };

export function AssignSlotClient({
  scheduleId,
  day,
  templateId,
  role,
  requiredCount,
  qualifiedStaff,
  allStaff,
}: {
  scheduleId: string;
  day: number;
  templateId: string;
  role: string;
  requiredCount: number;
  qualifiedStaff: StaffOption[];
  allStaff: StaffOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  // Prefer staff explicitly tagged with this job role; fall back to
  // everyone active rather than leaving the slot with no way to fill it if
  // the roster's `roles` tags don't happen to line up with this shift
  // requirement's role string.
  const options = qualifiedStaff.length > 0 ? qualifiedStaff : allStaff;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await assignStaff(formData);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      formRef.current?.reset();
      router.refresh();
    });
  }

  if (options.length === 0) {
    return <p className="text-xs text-zinc-400">No active staff to assign.</p>;
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="schedule_id" defaultValue={scheduleId} />
      <input type="hidden" name="day" defaultValue={day} />
      <input type="hidden" name="template_id" defaultValue={templateId} />
      <input type="hidden" name="role" defaultValue={role} />
      <input type="hidden" name="required_count" defaultValue={requiredCount} />
      <select
        name="staff_id"
        required
        defaultValue=""
        className="rounded-lg border border-zinc-300 px-2 py-1 text-xs text-zinc-900"
      >
        <option value="" disabled>
          Assign…
        </option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {isPending ? "…" : "Add"}
      </button>
      {qualifiedStaff.length === 0 && (
        <span className="text-xs text-amber-600">no staff tagged “{role}”</span>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
