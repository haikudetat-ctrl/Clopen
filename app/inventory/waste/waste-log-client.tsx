"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Item = { id: string; name: string; unit_abbreviation: string };

const REASONS = [
  { value: "spoilage", label: "Spoilage" },
  { value: "over_prep", label: "Over-prep" },
  { value: "breakage", label: "Breakage / dropped" },
  { value: "expired", label: "Expired" },
  { value: "quality_reject", label: "Quality reject" },
  { value: "comp_error", label: "Comp / kitchen error" },
  { value: "other", label: "Other" },
];

export function WasteLogClient({
  restaurantId,
  items,
}: {
  restaurantId: string;
  items: Item[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState(items[0]?.id ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const selectedItem = items.find((i) => i.id === selectedItemId);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const quantity = Number(formData.get("quantity"));
    const reason = String(formData.get("reason_code"));
    const notes = String(formData.get("notes") ?? "").trim();
    const occurredAt = String(formData.get("occurred_at"));

    if (!selectedItemId || !quantity || quantity <= 0) {
      setError("Pick an item and enter a quantity greater than 0.");
      return;
    }

    startTransition(async () => {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("inventory_log_waste", {
        p_restaurant_id: restaurantId,
        p_inventory_item_id: selectedItemId,
        p_quantity_base_unit: quantity,
        p_reason_code: reason,
        p_notes: notes === "" ? undefined : notes,
        p_occurred_at: new Date(occurredAt).toISOString(),
      });

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      formRef.current?.reset();
      router.refresh();
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500 sm:col-span-2">
          Item
          <select
            name="inventory_item_id"
            value={selectedItemId}
            onChange={(e) => setSelectedItemId(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          >
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Quantity ({selectedItem?.unit_abbreviation ?? ""})
          <input
            name="quantity"
            type="number"
            step="0.01"
            min="0.01"
            required
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Date
          <input
            name="occurred_at"
            type="date"
            defaultValue={today}
            max={today}
            required
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500 sm:col-span-2">
          Reason
          <select
            name="reason_code"
            defaultValue="spoilage"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          >
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500 sm:col-span-2">
          Notes (optional)
          <input
            name="notes"
            placeholder="e.g. case of tomatoes turned"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending || items.length === 0}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {isPending ? "Logging…" : "Log waste"}
        </button>
      </div>
    </form>
  );
}
