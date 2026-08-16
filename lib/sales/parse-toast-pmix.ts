/**
 * Parser for Toast's Product Mix (PMIX) "All levels" CSV export. Like the
 * PLCB parser, this is generic and restaurant-agnostic -- it turns the CSV
 * into a structured ToastPmix and knows nothing about any specific tenant.
 * The importer maps the result onto a restaurant and calls
 * ingest_daily_sales().
 *
 * Format notes, reverse-engineered from real exports rather than Toast
 * documentation. Every one of these was verified against two days of a real
 * venue's data:
 *
 *  - The PMIX report downloads as a folder of CSVs (Items, Menu groups,
 *    Menus, All levels, Total sales, Modifiers, Open items, Special
 *    requests, Percentage breakdown, Comparison labels). "All levels" is
 *    the one to parse: it is the only file carrying Menu, Menu group, AND
 *    Item on the same row, so no join is needed. Items.csv has the item
 *    detail but identifies its group only by a `parentId` that has to be
 *    resolved against Menu groups.csv.
 *
 *  - Rows are a flattened hierarchy. `Type` is 'menuItem' on leaf rows and
 *    EMPTY on the subtotal rows (grand total, per-menu, per-group). Filter
 *    to Type === 'menuItem' or you will double-count: the leaf rows sum
 *    exactly to the grand-total row.
 *
 *  - THE `Sales Category` COLUMN IS NOT RELIABLE. On the two sample days it
 *    was blank for 61% and 81% of item rows, accounting for 69% and 93% of
 *    gross revenue, and the only non-blank value ever present was 'Liquor'.
 *    It reflects whether someone configured a sales category on each menu
 *    item in Toast, which most venues never fully do. `Menu group` is
 *    populated on every row and is the signal to map GL revenue categories
 *    from. We keep the raw sales category when present purely for
 *    traceability.
 *
 *  - THE FILE CONTAINS NO DATE. The business date is an export parameter,
 *    not file content, and the filenames are generic ("All levels.csv").
 *    The caller must supply the date; this parser will not guess one.
 *
 *  - Voids are already excluded from `Gross item amt`. Net is gross minus
 *    discount (verified: 3101.00 - 0.60 = 3100.40). Voided amounts live in
 *    separate columns, and `Gross item amt incl. voids` is the sum of the
 *    two. So gross/discount/net map straight onto daily_sales, and voids
 *    belong on the day summary rather than reducing category revenue.
 *
 *  - Money and quantity columns arrive as bare decimal strings ("2386.0"),
 *    but a venue with thousands separators or currency symbols is plausible,
 *    so parsing is tolerant of both.
 */

export type PmixItem = {
  itemName: string;
  menu: string;
  menuGroup: string;
  salesCategoryRaw: string | null;
  quantity: number;
  gross: number;
  discounts: number;
  voids: number;
  refunds: number;
  net: number;
  tax: number;
};

/** Canonical GL revenue categories, matching ingest_daily_sales's contract. */
export const CANONICAL_CATEGORIES = [
  "food",
  "liquor",
  "beer_wine",
  "na_beverage",
  "other",
] as const;
export type CanonicalCategory = (typeof CANONICAL_CATEGORIES)[number];

export type ToastPmix = {
  items: PmixItem[];
  /** Distinct Menu group values in the file, for the mapping UI. */
  menuGroups: string[];
  /** Grand-total row as the file itself reports it, for reconciliation. */
  reported: {
    quantity: number;
    gross: number;
    discounts: number;
    voids: number;
    refunds: number;
    net: number;
    tax: number;
  } | null;
  headerSignature: string;
  warnings: string[];
};

const REQUIRED_COLUMNS = [
  "Type",
  "Menu",
  "Menu group",
  "Item, open item",
  "Qty sold",
  "Gross item amt",
  "Discount amt",
  "Net item amt",
];

/**
 * Splits one CSV line, honouring double-quoted fields (item names contain
 * commas -- "Broccolini, Pine Nut, and Anchovy" -- and two of the header
 * names are themselves quoted strings containing commas).
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text
    .replace(/^﻿/, "") // strip BOM; Toast exports carry one
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    return row;
  });
  return { headers, rows };
}

function num(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[$,\s]/g, "");
  if (cleaned === "" || cleaned === "-") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Stable fingerprint of the header row, used to recognize a file shape on a
 * later upload and skip the mapping step. Order-insensitive and
 * case-insensitive so a harmless column reorder doesn't force a re-map.
 */
export function headerSignature(headers: string[]): string {
  return headers
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("|");
}

export function parseToastPmix(text: string): ToastPmix {
  const warnings: string[] = [];
  const { headers, rows } = parseCsv(text);

  if (headers.length === 0) {
    throw new Error("That file appears to be empty.");
  }

  const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    throw new Error(
      `This doesn't look like a Toast PMIX "All levels" export — missing column${
        missing.length === 1 ? "" : "s"
      }: ${missing.join(", ")}. The PMIX download contains several CSVs; "All levels" is the one to upload.`,
    );
  }

  // Leaf rows only. Subtotal rows have an empty Type and would double-count.
  const itemRows = rows.filter((r) => r["Type"] === "menuItem");
  if (itemRows.length === 0) {
    throw new Error(
      "No item rows found in this file — every row was a subtotal. Check that the export covers a date range with sales.",
    );
  }

  const items: PmixItem[] = itemRows.map((r) => {
    const gross = num(r["Gross item amt"]);
    const discounts = num(r["Discount amt"]);
    const netCell = r["Net item amt"];
    return {
      itemName: r["Item, open item"],
      menu: r["Menu"],
      menuGroup: r["Menu group"],
      salesCategoryRaw: r["Sales Category"] ? r["Sales Category"] : null,
      quantity: num(r["Qty sold"]),
      gross,
      discounts,
      voids: num(r["Void amt"]),
      refunds: num(r["Refund amt"]),
      net: netCell !== undefined && netCell !== "" ? num(netCell) : gross - discounts,
      tax: num(r["Tax amt"]),
    };
  });

  const unnamed = items.filter((i) => !i.itemName).length;
  if (unnamed > 0) {
    warnings.push(
      `${unnamed} item row${unnamed === 1 ? " has" : "s have"} no item name and will be skipped.`,
    );
  }

  const withoutGroup = items.filter((i) => i.itemName && !i.menuGroup).length;
  if (withoutGroup > 0) {
    warnings.push(
      `${withoutGroup} item${withoutGroup === 1 ? "" : "s"} have no menu group — they can't be mapped to a revenue category and will need one assigned.`,
    );
  }

  // The grand-total row: no Menu, no Type. Used to reconcile our own sum.
  const totalRow = rows.find((r) => !r["Type"] && !r["Menu"]);
  const reported = totalRow
    ? {
        quantity: num(totalRow["Qty sold"]),
        gross: num(totalRow["Gross item amt"]),
        discounts: num(totalRow["Discount amt"]),
        voids: num(totalRow["Void amt"]),
        refunds: num(totalRow["Refund amt"]),
        net: num(totalRow["Net item amt"]),
        tax: num(totalRow["Tax amt"]),
      }
    : null;

  if (!reported) {
    warnings.push(
      "No grand-total row found in this file, so the parsed totals couldn't be cross-checked against Toast's own.",
    );
  } else {
    const summed = items.reduce((s, i) => s + i.gross, 0);
    if (Math.abs(summed - reported.gross) > 0.01) {
      warnings.push(
        `Item rows total ${summed.toFixed(2)} but the file's own total row says ${reported.gross.toFixed(
          2,
        )}. The file may be truncated or contain an unexpected row type.`,
      );
    }
  }

  const menuGroups = [...new Set(items.map((i) => i.menuGroup).filter(Boolean))].sort();

  const categorized = items.filter((i) => i.salesCategoryRaw).length;
  if (items.length > 0 && categorized / items.length < 0.9) {
    warnings.push(
      `Only ${categorized} of ${items.length} items have a Toast sales category set, so revenue is mapped by menu group instead.`,
    );
  }

  return {
    items,
    menuGroups,
    reported,
    headerSignature: headerSignature(headers),
    warnings,
  };
}

export type MenuGroupMap = Record<string, CanonicalCategory>;

export type RevenueLine = {
  category: CanonicalCategory;
  gross: number;
  discounts: number;
};

/**
 * Rolls parsed items up to the canonical GL revenue categories using a
 * per-restaurant menu-group map, and returns the payload pieces
 * ingest_daily_sales() expects.
 *
 * Menu groups with no mapping are reported rather than silently bucketed --
 * quietly defaulting an unmapped group would post real revenue to the wrong
 * GL account, which is exactly the kind of error nobody notices until a
 * month-end close.
 */
export function rollUpByCategory(
  pmix: ToastPmix,
  map: MenuGroupMap,
): {
  revenue: RevenueLine[];
  items: (PmixItem & { category: CanonicalCategory })[];
  unmappedGroups: string[];
} {
  const unmappedGroups = pmix.menuGroups.filter((g) => !map[g]);

  const named = pmix.items.filter((i) => i.itemName && map[i.menuGroup]);
  const items = named.map((i) => ({ ...i, category: map[i.menuGroup] }));

  const byCategory = new Map<CanonicalCategory, RevenueLine>();
  for (const item of items) {
    const line =
      byCategory.get(item.category) ??
      { category: item.category, gross: 0, discounts: 0 };
    line.gross += item.gross;
    line.discounts += item.discounts;
    byCategory.set(item.category, line);
  }

  const revenue = [...byCategory.values()]
    .map((l) => ({
      ...l,
      gross: Math.round(l.gross * 100) / 100,
      discounts: Math.round(l.discounts * 100) / 100,
    }))
    .sort((a, b) => a.category.localeCompare(b.category));

  return { revenue, items, unmappedGroups };
}

/**
 * Aggregates duplicate item rows before they reach ingest_daily_sales. The
 * same item can legitimately appear more than once in a PMIX export (across
 * menus, or split by modifier), and daily_item_sales is uniquely keyed on
 * (date, item, group, category) -- so un-aggregated input would be rejected
 * by the database rather than silently deduped.
 */
export function aggregateItems(
  items: (PmixItem & { category: CanonicalCategory })[],
): {
  item_name: string;
  menu_group: string;
  category: CanonicalCategory;
  sales_category_raw: string | null;
  quantity: number;
  gross: number;
  discounts: number;
  voids: number;
  refunds: number;
  net: number;
}[] {
  const merged = new Map<string, ReturnType<typeof aggregateItems>[number]>();
  for (const i of items) {
    const key = `${i.itemName} ${i.menuGroup} ${i.category}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += i.quantity;
      existing.gross += i.gross;
      existing.discounts += i.discounts;
      existing.voids += i.voids;
      existing.refunds += i.refunds;
      existing.net += i.net;
      existing.sales_category_raw ??= i.salesCategoryRaw;
    } else {
      merged.set(key, {
        item_name: i.itemName,
        menu_group: i.menuGroup,
        category: i.category,
        sales_category_raw: i.salesCategoryRaw,
        quantity: i.quantity,
        gross: i.gross,
        discounts: i.discounts,
        voids: i.voids,
        refunds: i.refunds,
        net: i.net,
      });
    }
  }
  return [...merged.values()].map((i) => ({
    ...i,
    quantity: Math.round(i.quantity * 1000) / 1000,
    gross: Math.round(i.gross * 100) / 100,
    discounts: Math.round(i.discounts * 100) / 100,
    voids: Math.round(i.voids * 100) / 100,
    refunds: Math.round(i.refunds * 100) / 100,
    net: Math.round(i.net * 100) / 100,
  }));
}
