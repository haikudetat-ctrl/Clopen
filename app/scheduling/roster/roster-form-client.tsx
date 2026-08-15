"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStaff, updateStaff } from "./actions";
import { formatRoles } from "@/lib/scheduling";

type Staff = {
  id: string;
  name: string;
  roles: string[];
  skill_level: number;
};

export function RosterFormClient({
  staff,
  onSaved,
}: {
  staff?: Staff;
  onSaved?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(!staff);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = staff
        ? await updateStaff(formData)
        : await createStaff(formData);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      if (!staff) {
        formRef.current?.reset();
        setOpen(false);
      }
      router.refresh();
      onSaved?.();
    });
  }

  if (!staff && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Add staff
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5"
    >
      {staff && <input type="hidden" name="id" defaultValue={staff.id} />}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Name
          <input
            name="name"
            required
            defaultValue={staff?.name ?? ""}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Skill level (1-5)
          <input
            name="skill_level"
            type="number"
            min={1}
            max={5}
            required
            defaultValue={staff?.skill_level ?? 1}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Job roles
          <input
            name="roles"
            placeholder="server, bartender"
            defaultValue={formatRoles(staff?.roles)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
          <span className="font-normal normal-case text-zinc-400">
            Comma-separated — used to match staff to shift requirements when
            building a schedule.
          </span>
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        {!staff && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={isPending}
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {isPending ? "Saving…" : staff ? "Save changes" : "Add staff"}
        </button>
      </div>
    </form>
  );
}
