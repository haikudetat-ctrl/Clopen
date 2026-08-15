"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createShiftNote, updateShiftNote } from "./actions";
import { PRIORITIES, SHIFT_TYPES, scopesForRole } from "@/lib/shift-notes";

type ShiftNote = {
  id: string;
  title: string;
  body: string;
  service_date: string;
  shift_type: string | null;
  note_scope: string;
  priority: string;
  is_pinned: boolean;
  expires_at: string | null;
};

const today = () => new Date().toISOString().slice(0, 10);

export function ShiftNoteFormClient({
  note,
  role,
  onSaved,
}: {
  note?: ShiftNote;
  role: string;
  onSaved?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(!note);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const scopeOptions = scopesForRole(role);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = note
        ? await updateShiftNote(formData)
        : await createShiftNote(formData);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      if (!note) {
        formRef.current?.reset();
        setOpen(false);
      }
      router.refresh();
      onSaved?.();
    });
  }

  if (!note && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Post a note
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4"
    >
      {note && <input type="hidden" name="id" defaultValue={note.id} />}

      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Title
        <input
          name="title"
          required
          defaultValue={note?.title ?? ""}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Note
        <textarea
          name="body"
          required
          rows={3}
          defaultValue={note?.body ?? ""}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Service date
          <input
            name="service_date"
            type="date"
            required
            defaultValue={note?.service_date ?? today()}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Shift
          <select
            name="shift_type"
            defaultValue={note?.shift_type ?? ""}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          >
            <option value="">Any</option>
            {SHIFT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Scope
          <select
            name="note_scope"
            defaultValue={note?.note_scope ?? scopeOptions[0]}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          >
            {scopeOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Priority
          <select
            name="priority"
            defaultValue={note?.priority ?? "normal"}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Expires (optional)
        <input
          name="expires_at"
          type="date"
          defaultValue={note?.expires_at?.slice(0, 10) ?? ""}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-zinc-700">
        <input
          type="checkbox"
          name="is_pinned"
          defaultChecked={note?.is_pinned ?? false}
          className="h-4 w-4 rounded border-zinc-300"
        />
        Pin to top
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        {!note && (
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
          {isPending ? "Saving…" : note ? "Save changes" : "Post note"}
        </button>
      </div>
    </form>
  );
}
