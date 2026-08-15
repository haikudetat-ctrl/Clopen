"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addAvailability } from "./actions";
import { DAY_LABELS } from "@/lib/scheduling";

/** Shared by the owner's roster detail page and the self-service my-availability page. */
export function AvailabilityFormClient({ staffId }: { staffId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await addAvailability(formData);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4"
    >
      <input type="hidden" name="staff_id" defaultValue={staffId} />
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Day
        <select
          name="day_of_week"
          defaultValue={0}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        >
          {DAY_LABELS.map((label, i) => (
            <option key={label} value={i}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Start
        <input
          name="start_time"
          type="time"
          required
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        End
        <input
          name="end_time"
          type="time"
          required
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {isPending ? "Adding…" : "Add availability"}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
