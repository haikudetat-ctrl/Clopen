"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTemplate, updateTemplate } from "./actions";

type Template = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
};

export function TemplateFormClient({
  template,
  onSaved,
}: {
  template?: Template;
  onSaved?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(!template);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = template
        ? await updateTemplate(formData)
        : await createTemplate(formData);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      if (!template) {
        formRef.current?.reset();
        setOpen(false);
      }
      router.refresh();
      onSaved?.();
    });
  }

  if (!template && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Add shift template
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5"
    >
      {template && <input type="hidden" name="id" defaultValue={template.id} />}
      <div className="grid grid-cols-3 gap-3">
        <label className="col-span-3 flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Name
          <input
            name="name"
            required
            placeholder="Dinner"
            defaultValue={template?.name ?? ""}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Start
          <input
            name="start_time"
            type="time"
            required
            defaultValue={template?.start_time ?? ""}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          End
          <input
            name="end_time"
            type="time"
            required
            defaultValue={template?.end_time ?? ""}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        {!template && (
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
          {isPending ? "Saving…" : template ? "Save changes" : "Add template"}
        </button>
      </div>
    </form>
  );
}
