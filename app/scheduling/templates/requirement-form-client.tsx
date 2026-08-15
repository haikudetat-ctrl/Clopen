"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addRequirement } from "./actions";

export function RequirementFormClient({ templateId }: { templateId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await addRequirement(formData);
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
      className="flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="template_id" defaultValue={templateId} />
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Role
        <input
          name="role"
          required
          placeholder="server"
          className="w-32 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Needed
        <input
          name="required_count"
          type="number"
          min={1}
          required
          defaultValue={1}
          className="w-20 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {isPending ? "Adding…" : "Add role"}
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </form>
  );
}
