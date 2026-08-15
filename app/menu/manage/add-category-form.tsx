"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMenuCategory } from "../actions";

export function AddCategoryForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createMenuCategory(formData);
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
      className="flex items-end gap-2"
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        New category
        <input
          name="name"
          required
          placeholder="e.g. Starters"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400 disabled:opacity-50"
      >
        {isPending ? "Adding…" : "Add category"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
