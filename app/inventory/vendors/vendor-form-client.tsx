"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createVendor, updateVendor } from "./actions";

type Vendor = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  account_number: string | null;
  payment_terms: string | null;
};

export function VendorFormClient({
  vendor,
  onSaved,
}: {
  vendor?: Vendor;
  onSaved?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(!vendor);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = vendor
        ? await updateVendor(formData)
        : await createVendor(formData);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      if (!vendor) {
        formRef.current?.reset();
        setOpen(false);
      }
      router.refresh();
      onSaved?.();
    });
  }

  if (!vendor && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Add vendor
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5"
    >
      {vendor && <input type="hidden" name="id" defaultValue={vendor.id} />}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Vendor name
          <input
            name="name"
            required
            defaultValue={vendor?.name ?? ""}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Account number
          <input
            name="account_number"
            defaultValue={vendor?.account_number ?? ""}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Contact name
          <input
            name="contact_name"
            defaultValue={vendor?.contact_name ?? ""}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Payment terms
          <input
            name="payment_terms"
            placeholder="Net 30"
            defaultValue={vendor?.payment_terms ?? ""}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Contact email
          <input
            name="contact_email"
            type="email"
            defaultValue={vendor?.contact_email ?? ""}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Contact phone
          <input
            name="contact_phone"
            defaultValue={vendor?.contact_phone ?? ""}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        {!vendor && (
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
          {isPending ? "Saving…" : vendor ? "Save changes" : "Add vendor"}
        </button>
      </div>
    </form>
  );
}
