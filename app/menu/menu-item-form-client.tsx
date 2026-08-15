"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMenuItem, updateMenuItem } from "./actions";

type Category = { id: string; name: string };

type MenuItem = {
  id: string;
  name: string;
  category_id: string | null;
  price: number | null;
  pronunciation: string | null;
  short_description: string | null;
  guest_description: string | null;
  allergens: string[];
  dietary_tags: string[];
  service_script: string | null;
  pairings: string | null;
  upsell_notes: string | null;
  is_86d: boolean;
};

export function MenuItemFormClient({
  item,
  categories,
  onSaved,
}: {
  item?: MenuItem;
  categories: Category[];
  onSaved?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(!item);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = item
        ? await updateMenuItem(formData)
        : await createMenuItem(formData);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      if (!item) {
        formRef.current?.reset();
        setOpen(false);
      }
      router.refresh();
      onSaved?.();
    });
  }

  if (!item && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Add menu item
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5"
    >
      {item && <input type="hidden" name="id" defaultValue={item.id} />}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Name
          <input
            name="name"
            required
            defaultValue={item?.name ?? ""}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Category
          <select
            name="category_id"
            defaultValue={item?.category_id ?? ""}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          >
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Price
          <input
            name="price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={item?.price ?? ""}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Pronunciation
          <input
            name="pronunciation"
            placeholder="e.g. broo-SKET-ah"
            defaultValue={item?.pronunciation ?? ""}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Short description
        <input
          name="short_description"
          placeholder="Internal, e.g. for a POS button or quick reference"
          defaultValue={item?.short_description ?? ""}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Guest description
        <textarea
          name="guest_description"
          rows={2}
          placeholder="What staff describe to the guest"
          defaultValue={item?.guest_description ?? ""}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Allergens (comma-separated)
          <input
            name="allergens"
            placeholder="dairy, gluten, tree nuts"
            defaultValue={item?.allergens?.join(", ") ?? ""}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Dietary tags (comma-separated)
          <input
            name="dietary_tags"
            placeholder="vegetarian, vegan, gf"
            defaultValue={item?.dietary_tags?.join(", ") ?? ""}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
        Service script
        <textarea
          name="service_script"
          rows={2}
          placeholder="How a server should present or talk about this item"
          defaultValue={item?.service_script ?? ""}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Pairings
          <textarea
            name="pairings"
            rows={2}
            defaultValue={item?.pairings ?? ""}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Upsell notes
          <textarea
            name="upsell_notes"
            rows={2}
            defaultValue={item?.upsell_notes ?? ""}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-700">
        <input
          type="checkbox"
          name="is_86d"
          defaultChecked={item?.is_86d ?? false}
          className="h-4 w-4 rounded border-zinc-300"
        />
        86&apos;d right now
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        {!item && (
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
          {isPending ? "Saving…" : item ? "Save changes" : "Add item"}
        </button>
      </div>
    </form>
  );
}
