"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { parsePlcbUpload } from "./actions";
import type { PlcbOrder } from "@/lib/plcb/parse-invoice";

type Stage =
  | { name: "idle" }
  | { name: "parsing" }
  | { name: "previewing"; order: PlcbOrder }
  | { name: "submitting"; order: PlcbOrder }
  | { name: "done"; order: PlcbOrder; message: string }
  | { name: "duplicate"; order: PlcbOrder; message: string }
  | { name: "error"; message: string };

const money = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function ImportPlcbClient({ restaurantId }: { restaurantId: string }) {
  const [stage, setStage] = useState<Stage>({ name: "idle" });
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStage({ name: "parsing" });
    startTransition(async () => {
      const formData = new FormData();
      formData.append("file", file);
      const result = await parsePlcbUpload(formData);
      if (!result.ok) {
        setStage({ name: "error", message: result.error });
        return;
      }
      setStage({ name: "previewing", order: result.order });
    });
  }

  function handleConfirm(order: PlcbOrder) {
    setStage({ name: "submitting", order });
    startTransition(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("plcb_ingest_order", {
        p_restaurant_id: restaurantId,
        p_order: order as never,
      });

      if (error) {
        setStage({ name: "error", message: error.message });
        return;
      }

      const result = data as { status: string; message?: string } | null;
      if (result?.status === "duplicate") {
        setStage({
          name: "duplicate",
          order,
          message: result.message ?? "This order was already imported.",
        });
        return;
      }

      setStage({
        name: "done",
        order,
        message: `Received into inventory and posted an invoice for order ${order.orderNumber}.`,
      });
    });
  }

  function reset() {
    setStage({ name: "idle" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const shippableItems =
    stage.name === "previewing" || stage.name === "submitting"
      ? stage.order.lineItems.filter((li) => li.shippedQty > 0)
      : [];

  return (
    <div className="flex flex-col gap-6">
      {(stage.name === "idle" || stage.name === "error") && (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center">
          <p className="text-sm text-zinc-600">
            Upload a PLCB Licensee Online Order Portal PDF to preview what
            will be received into inventory.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFileChange}
            className="mx-auto mt-4 block text-sm text-zinc-600 file:mr-4 file:rounded-full file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-700"
          />
          {stage.name === "error" && (
            <p className="mt-4 text-sm text-red-600">{stage.message}</p>
          )}
        </div>
      )}

      {stage.name === "parsing" && (
        <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
          Reading the PDF…
        </div>
      )}

      {(stage.name === "previewing" || stage.name === "submitting") && (
        <>
          {stage.order.warnings.length > 0 && (
            <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-medium">
                {stage.order.warnings.length} thing
                {stage.order.warnings.length === 1 ? "" : "s"} to check before
                importing:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {stage.order.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-zinc-900">
                  Order {stage.order.orderNumber || "(unknown)"}
                </div>
                <div className="text-xs text-zinc-500">
                  {stage.order.orderDate || "unknown date"} ·{" "}
                  {stage.order.orderType === "pickup" ? "Pickup" : "Special order"}
                  {stage.order.importerName ? ` · from ${stage.order.importerName}` : ""}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-right text-xs text-zinc-500 sm:grid-cols-4">
                <div>
                  <div className="text-zinc-400">Gross</div>
                  <div className="text-zinc-900">{money(stage.order.grossPrice)}</div>
                </div>
                <div>
                  <div className="text-zinc-400">Tax</div>
                  <div className="text-zinc-900">{money(stage.order.tax)}</div>
                </div>
                <div>
                  <div className="text-zinc-400">Freight</div>
                  <div className="text-zinc-900">{money(stage.order.freight)}</div>
                </div>
                <div>
                  <div className="text-zinc-400">Total</div>
                  <div className="font-semibold text-zinc-900">
                    {money(stage.order.orderTotal)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-400">
                  <th className="px-4 py-2.5 font-medium">Item</th>
                  <th className="px-4 py-2.5 text-right font-medium">Size</th>
                  <th className="px-4 py-2.5 text-right font-medium">Qty received</th>
                  <th className="px-4 py-2.5 text-right font-medium">Unit price</th>
                  <th className="px-4 py-2.5 text-right font-medium">Line total</th>
                </tr>
              </thead>
              <tbody>
                {stage.order.lineItems.map((li, i) => (
                  <tr
                    key={i}
                    className={`border-b border-zinc-100 last:border-0 ${
                      li.shippedQty <= 0 ? "text-zinc-400" : "text-zinc-900"
                    }`}
                  >
                    <td className="px-4 py-2">
                      {li.name || `(unnamed item ${li.itemCode})`}
                      <span className="ml-1 text-zinc-400">#{li.itemCode}</span>
                      {li.shippedQty <= 0 && (
                        <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                          not shipped — excluded
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-500">{li.sizeMl}mL</td>
                    <td className="px-4 py-2 text-right">{li.shippedQty}</td>
                    <td className="px-4 py-2 text-right">{money(li.unitPrice)}</td>
                    <td className="px-4 py-2 text-right">{money(li.itemTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={reset}
              disabled={isPending}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => handleConfirm(stage.order)}
              disabled={isPending || shippableItems.length === 0}
              className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {stage.name === "submitting"
                ? "Receiving…"
                : `Confirm & receive ${shippableItems.length} item${shippableItems.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}

      {(stage.name === "done" || stage.name === "duplicate") && (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center">
          <p
            className={`text-sm font-medium ${
              stage.name === "done" ? "text-emerald-700" : "text-amber-700"
            }`}
          >
            {stage.message}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              onClick={reset}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
            >
              Import another
            </button>
            <Link
              href="/inventory/purchasing"
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Back to purchasing
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
