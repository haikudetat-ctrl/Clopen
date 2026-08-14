"use server";

import { PDFParse } from "pdf-parse";
import { parsePlcbInvoiceText, type PlcbOrder } from "@/lib/plcb/parse-invoice";
import { getCurrentProfile } from "@/lib/current-profile";

export type ParsePlcbResult =
  | { ok: true; order: PlcbOrder }
  | { ok: false; error: string };

/**
 * Extracts text from an uploaded PLCB PDF and runs it through the generic
 * parser. This has to be a server action (not client-side) because
 * pdf-parse is a Node library -- it can't run in the browser. Nothing here
 * touches the database; this is preview-only. The actual ingest happens
 * client-side via the plcb_ingest_order RPC once the operator confirms
 * what they see.
 */
export async function parsePlcbUpload(formData: FormData): Promise<ParsePlcbResult> {
  // Re-check auth here too, even though this only reads a file the operator
  // just uploaded -- server actions are callable directly, not just from
  // the page that renders them.
  const { user, profile } = await getCurrentProfile();
  if (!user || profile?.role !== "owner_admin") {
    return { ok: false, error: "Not authorized." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No file was uploaded." };
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return { ok: false, error: "Please upload a PDF file." };
  }

  let text: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    text = result.text;
  } catch (err) {
    return {
      ok: false,
      error: `Couldn't read that PDF: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const order = parsePlcbInvoiceText(text);
  return { ok: true, order };
}
