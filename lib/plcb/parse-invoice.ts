/**
 * Parser for PLCB "Licensee Online Order Portal" (lcbloop.com) order/invoice
 * PDFs. This is a generic, restaurant-agnostic parser -- it has no knowledge
 * of any specific client's restaurant_id, vendors, or catalog. It just turns
 * the PDF's extracted text into a structured PlcbOrder. The ingestion layer
 * (ingest-invoice.ts) is what maps a PlcbOrder onto a specific tenant.
 *
 * Format notes (reverse-engineered from real exports, not PLCB documentation
 * -- if PLCB changes their portal layout, this will need updating):
 *  - Two order types: "Special Order" (drop-shipped from a named importer,
 *    freight billed separately, non-taxable) and "Pickup" (from a PLCB
 *    store, no freight, has its own Pickup Date distinct from Order Date).
 *  - Line items show a per-bottle size + $/oz descriptor ("750ML (1 bottle)
 *    | $0.45 per ounce"). Bottle size is what we need for the base-unit
 *    (fl oz) conversion -- the $/oz figure is a nice cross-check but not
 *    load-bearing.
 *  - Discounted lines render as multiple stacked dollar amounts (current
 *    price, "Licensee Discount", one or two struck-through reference
 *    prices). The FIRST dollar amount after "Shipped: N" is always the
 *    real per-unit price actually charged -- verified against Item Total /
 *    Shipped qty on every sample seen.
 *  - PDF text extraction reflows around page breaks. A line item's size
 *    descriptor occasionally lands at the end of the PRECEDING item's text
 *    block instead of immediately after its own name, when the descriptor
 *    happens to sit right at a page boundary. We search the whole block
 *    (not just "before Ordered:") for exactly this reason.
 */

export type PlcbLineItem = {
  itemCode: string;
  name: string;
  sizeMl: number | null; // null if the size descriptor couldn't be found -- flagged, not guessed
  orderedQty: number;
  shippedQty: number;
  unitPrice: number;
  itemTotal: number;
};

export type PlcbOrder = {
  orderNumber: string;
  orderDate: string; // ISO yyyy-mm-dd
  orderType: "special_order" | "pickup";
  importerName: string | null; // only present for Special Orders
  status: string;
  licensePremiseAddress: string;
  pickupDate: string | null; // ISO date, Pickup orders only
  totalBottles: number | null;
  grossPrice: number | null;
  discountTotal: number | null;
  // Covers both observed labels for the same concept -- an order-level fee
  // that ADDS to Gross Price to arrive at Taxable Amount (opposite of the
  // Discounts line, which subtracts). Seen as "Supplier-Imposed Shipping
  // Fee" on some orders and "PLCB Handling Fee" on others; functionally
  // identical, so tracked as one field.
  additionalOrderFee: number | null;
  taxableAmount: number | null;
  tax: number | null;
  freight: number | null;
  orderTotal: number | null;
  lineItems: PlcbLineItem[];
  warnings: string[];
};

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function toIsoDate(text: string): string | null {
  const m = text.match(/([A-Za-z]{3})[a-z]* (\d{1,2}), (\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[1]];
  if (!month) return null;
  return `${m[3]}-${month}-${m[2].padStart(2, "0")}`;
}

function toNumber(text: string | undefined | null): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[$,]/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// Bottle size text -> milliliters. PLCB sizes are a small fixed set;
// unrecognized text is left null rather than guessed.
function sizeTextToMl(sizeText: string): number | null {
  const m = sizeText.match(/([\d.]+)\s*(ML|L)\b/i);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  return m[2].toUpperCase() === "L" ? value * 1000 : value;
}

// Boilerplate lines that show up interleaved with real content because of
// how the PDF paginates -- stripped before block-splitting so they never
// get mistaken for part of an item's data.
const BOILERPLATE_LINE_PATTERNS = [
  /^Because freight on Special Orders is not$/,
  /^subject to sales tax, it is broken out$/,
  /^separately from the product price\.$/,
  /^\*$/,
  /^\d{1,2}\/\d{1,2}\/\d{2,4}, \d{1,2}:\d{2} ?(AM|PM)\s*\t?Licensee Online Order Portal$/i,
  /^https:\/\/www\.lcbloop\.com\/order-details/,
  /^-- \d+ of \d+ --$/,
  /^\d+\/\d+$/, // page footer "1/2"
  /^Discounts\s*$/,
];

function stripBoilerplate(text: string): string {
  return text
    .split("\n")
    .filter((line) => !BOILERPLATE_LINE_PATTERNS.some((p) => p.test(line.trim())))
    .join("\n");
}

export function parsePlcbInvoiceText(rawText: string): PlcbOrder {
  const warnings: string[] = [];
  const text = rawText.replace(/\r\n/g, "\n");

  const orderNumberMatch = text.match(/Order #\n(\d+)/);
  const orderNumber = orderNumberMatch?.[1] ?? "";
  if (!orderNumber) warnings.push("Could not find an order number.");

  const orderDateMatch = text.match(/Order Date\n([A-Za-z]{3,9} \d{1,2}, \d{4})/);
  const orderDate = orderDateMatch ? toIsoDate(orderDateMatch[1]) : null;
  if (!orderDate) warnings.push("Could not parse the order date.");

  const isPickup = /Order Type\nPickup/.test(text);
  const orderType: PlcbOrder["orderType"] = isPickup ? "pickup" : "special_order";

  let importerName: string | null = null;
  if (!isPickup) {
    // Importer names wrap across a variable number of lines depending on
    // length ("from CAPITAL\nWINE &\nSPIRITS (Ship to" is 3 lines; others
    // are 1 or 2). Even the closing "(Ship to" anchor itself can wrap
    // ("(Ship\nto Address)"), so tolerate whitespace inside it too. Match
    // everything up to that anchor non-greedily rather than assuming a
    // fixed line count, then collapse whitespace/newlines.
    const importerMatch = text.match(/Order Type\nSpecial Order\nfrom\s*([\s\S]+?)\s*\(Ship\s+to/);
    if (importerMatch) {
      importerName = importerMatch[1].replace(/\s+/g, " ").trim();
    }
    if (!importerName) {
      warnings.push("Order type is Special Order but couldn't extract the importer name.");
    }
  }

  const statusMatch = text.match(/Status\n([^\n]+)/);
  const status = statusMatch?.[1]?.trim() ?? "";

  const premiseMatch = text.match(/License Premise\n([^\n]+)\n([^\n]+)/);
  const licensePremiseAddress = premiseMatch
    ? `${premiseMatch[1].trim()}, ${premiseMatch[2].trim()}`
    : "";
  if (!licensePremiseAddress) warnings.push("Could not find the License Premise address.");

  let pickupDate: string | null = null;
  if (isPickup) {
    const pickupDateMatch = text.match(/Pickup Date\n([A-Za-z]{3,9} \d{1,2}, \d{4})/);
    pickupDate = pickupDateMatch ? toIsoDate(pickupDateMatch[1]) : null;
  }

  const totalBottles = toNumber(text.match(/Total Bottles\s*\t?(\d+)/)?.[1]);
  const grossPrice = toNumber(text.match(/Gross Price\s*\t?\$([\d,.]+)/)?.[1]);
  const discountTotal = toNumber(text.match(/Gross Price\s*\t?\$[\d,.]+\n-\$([\d,.]+)/)?.[1]);
  // Some orders carry an order-level fee between Gross Price and Taxable
  // Amount -- seen labeled both "Supplier-Imposed Shipping Fee" and "PLCB
  // Handling Fee" across different orders. Unlike the Discounts line (which
  // subtracts), this ADDS to Gross Price to arrive at Taxable Amount. It's
  // unrelated to any line item, so it must be tracked separately rather
  // than folded into freight or the line-item sum.
  const additionalOrderFee = toNumber(
    text.match(/(?:Supplier-Imposed Shipping Fee|PLCB Handling Fee)\s*\t?\$?([\d,.]+)/)?.[1],
  );
  const taxableAmount = toNumber(text.match(/Taxable Amount\s*\t?\$([\d,.]+)/)?.[1]);
  const tax = toNumber(text.match(/\nTax\s*\t?\$([\d,.]+)/)?.[1]);
  const freight = toNumber(text.match(/Freight\*?\s*\t?\$([\d,.]+)/)?.[1]);
  const orderTotal = toNumber(text.match(/Order Total\s*\t?\$([\d,.]+)/)?.[1]);

  // Everything after the item table header is line-item territory.
  const tableSplit = text.split(/Item\s*\t?Qty \(Bottles\)\s*\t?Unit Price\s*\t?Item Total/);
  const lineItems: PlcbLineItem[] = [];
  if (tableSplit.length < 2) {
    warnings.push("Could not locate the line-item table.");
  } else {
    const itemsText = stripBoilerplate(tableSplit.slice(1).join(""));
    const lines = itemsText.split("\n");

    // Find every line that STARTS with a run of digits followed by
    // whitespace or end-of-line -- these are PLCB item codes. Usually a
    // code sits alone on its own line, but when a row straddles a page
    // break, the code can end up glued to trailing table-cell content on
    // the same line (e.g. "6434 \tOrdered: 3 \t$102.57", with the item's
    // name/size/shipped-qty pushed onto the next page entirely). Matching
    // on a leading digit run rather than requiring the whole line to be
    // digits catches both shapes, while still excluding size descriptors
    // ("750ML...", digits immediately followed by a letter) and anything
    // else where non-whitespace follows the digits directly.
    const orderedOccurrences = (itemsText.match(/Ordered:\s*\d+/g) ?? []).length;

    const codeLineIndexes: number[] = [];
    lines.forEach((line, i) => {
      if (/^\d{3,9}(\s|$)/.test(line)) codeLineIndexes.push(i);
    });

    // Rare but seen: a line item prints with NO item code anywhere in the
    // extracted text (its "Ordered:/Shipped:/$price" content sits before
    // the first detected code line, with nothing identifying which product
    // it is). Silently dropping that dollar amount would be worse than
    // flagging it -- surface it loudly rather than guess at a product.
    const leadingSegment = lines.slice(0, codeLineIndexes[0] ?? lines.length).join("\n");
    if (/Ordered:\s*\d+/.test(leadingSegment)) {
      warnings.push(
        "Found order content (quantity/price) before any item code could be matched -- this charge is NOT included in the parsed totals. Please check the original PDF.",
      );
    }

    for (let i = 0; i < codeLineIndexes.length; i++) {
      const start = codeLineIndexes[i];
      const end = i + 1 < codeLineIndexes.length ? codeLineIndexes[i + 1] : lines.length;
      const block = lines.slice(start, end).join("\n");
      const itemCode = (lines[start].match(/^\d+/) ?? [""])[0];

      const nameMatch = block.match(/^\d+\n([^\n]+)/);
      let name = nameMatch?.[1]?.trim() ?? "";
      if (!name) {
        // The code line detection above also matches codes with trailing
        // content glued on by a page-break reflow ("6434 \tOrdered: 3
        // \t$102.57"), which means the name isn't on the very next line
        // anymore -- it got pushed further down the block. Fall back to
        // scanning the block for the first line that isn't itself a
        // qty/price/size/discount fragment; that's the product name.
        for (const rawLine of block.split("\n").slice(1)) {
          const candidate = rawLine.trim();
          if (!candidate) continue;
          if (/^(Ordered|Shipped|Discount)\b/i.test(candidate)) continue;
          if (/^\$/.test(candidate)) continue;
          if (/per ounce/i.test(candidate)) continue;
          if (/^[\d.]+\s*M?L\b/i.test(candidate)) continue;
          name = candidate;
          break;
        }
      }

      const sizeMatch = block.match(/([\d.]+\s*M?L)\s*\(1 bottle\)\s*\|\s*\$[\d.]+ per ounce/i);
      const sizeMl = sizeMatch ? sizeTextToMl(sizeMatch[1]) : null;

      const orderedMatch = block.match(/Ordered:\s*(\d+)/);
      const shippedMatch = block.match(/Shipped:\s*(\d+)/);
      const orderedQty = toNumber(orderedMatch?.[1]) ?? 0;
      // Orders still in "Processing" status don't carry a per-item
      // "Shipped: N" line at all -- only "Ordered: N" -- and their Item
      // Total reflects the full ordered quantity. Only orders that DO
      // report shipment status can show a genuine backorder (Shipped: 0).
      const shippedQty = shippedMatch ? (toNumber(shippedMatch[1]) ?? 0) : orderedQty;
      const isGenuineBackorder = shippedMatch !== null && shippedQty === 0;

      // Strip "$X per ounce" out entirely before scanning for prices -- a
      // page-break-displaced size descriptor can end up trailing at the end
      // of the PRECEDING item's block (see module comment), and its $/oz
      // figure would otherwise get mistaken for that item's total since
      // it's the last dollar amount in the block. (A negative lookahead
      // here is tempting but wrong: greedy digit matching backtracks around
      // it, e.g. "$0.77 per ounce" ends up matching "$0.7" instead of being
      // excluded -- removing the whole phrase first avoids that entirely.)
      const blockForPrices = block.replace(/\$[\d,.]+ per ounce/g, "");

      const afterShipped = shippedMatch
        ? blockForPrices.slice(blockForPrices.indexOf(shippedMatch[0]) + shippedMatch[0].length)
        : blockForPrices;
      const firstPriceMatch = afterShipped.match(/\$([\d,.]+)/);
      const unitPrice = toNumber(firstPriceMatch?.[1]) ?? 0;

      // Item Total is derived as unitPrice * shippedQty rather than read
      // positionally off the page. Scanning for "the item total dollar
      // figure in the block" is fragile -- normally it's the LAST price
      // in the block (after any struck-through reference prices), but
      // when a row straddles a page break the printed total can land
      // BEFORE those reference prices instead (see the item-code-line
      // comment above for why). unitPrice * shippedQty reconciles exactly
      // against PLCB's own printed Item Total on every sample checked,
      // regardless of how the row's text got reflowed.
      const itemTotal = Math.round(unitPrice * shippedQty * 100) / 100;

      if (!name) warnings.push(`Item ${itemCode}: could not read a product name.`);
      if (sizeMl === null) warnings.push(`Item ${itemCode} (${name || "unknown"}): could not determine bottle size -- defaulting to 750mL, please verify.`);
      if (isGenuineBackorder) warnings.push(`Item ${itemCode} (${name || "unknown"}): shipped quantity is 0 -- backordered/cancelled, excluded from totals.`);

      // A block can end up containing a SECOND "Ordered:/Shipped:" pair
      // that actually belongs to a different item whose own code line got
      // lost to a page-break reflow (rather than the missing-code content
      // landing before the first code, which the leading-segment check
      // above already covers). orderedMatch/shippedMatch only ever grab
      // the first pair, so that second charge would otherwise vanish with
      // no trace -- a global count of "Ordered:" occurrences across the
      // whole table can miss this too, since one block over-counting can
      // net against another block under-counting to look balanced overall.
      const orderedPairsInBlock = [...block.matchAll(/Ordered:\s*\d+/g)].length;
      if (orderedPairsInBlock > 1) {
        warnings.push(
          `Item ${itemCode} (${name || "unknown"})'s block contains ${orderedPairsInBlock} "Ordered:" quantities but only the first was used -- another item's charge may be folded in here uncounted. Please check the original PDF.`,
        );
      }

      lineItems.push({
        itemCode,
        name,
        sizeMl: sizeMl ?? 750,
        orderedQty,
        shippedQty,
        unitPrice,
        itemTotal,
      });
    }

    // Safety net: if a page-break reflow ever glues a SECOND item's
    // "Ordered:/Shipped:" pair into a block we already attributed to the
    // preceding code (rather than getting its own code line at all), that
    // second item's charge would otherwise vanish silently -- orderedMatch
    // only ever grabs the first occurrence per block. Comparing total
    // "Ordered:" occurrences in the table against parsed line items catches
    // that case even though we can't automatically recover the product.
    const unaccountedOrders = orderedOccurrences - lineItems.length;
    if (unaccountedOrders > 0) {
      warnings.push(
        `Found ${unaccountedOrders} more "Ordered:" quantity block(s) in the item table than could be matched to a distinct product -- some charges may be missing from the parsed totals. Please check the original PDF.`,
      );
    }
  }

  if (lineItems.length === 0) warnings.push("No line items were parsed from this invoice.");

  // Final reconciliation: the sum of parsed line-item totals should equal
  // Taxable Amount (or Gross Price, if there's no separate taxable figure)
  // minus any additional order-level fee, which isn't tied to a line item.
  // A handful of real orders have shown a small (~$1) unexplained gap on a
  // single line -- rather than let that flow silently into a purchase
  // order and post a wrong number to the ledger, flag it here so whoever
  // (or whatever ingestion step) confirms the import can catch it. This is
  // the parser's own last line of defense, independent of any of the
  // specific-cause warnings pushed above.
  const reconciliationBase = taxableAmount ?? grossPrice;
  if (reconciliationBase !== null) {
    const lineItemSum = lineItems.reduce((sum, li) => sum + li.itemTotal, 0);
    const expected = reconciliationBase - (additionalOrderFee ?? 0);
    const diff = Math.round((lineItemSum - expected) * 100) / 100;
    if (Math.abs(diff) > 0.02) {
      warnings.push(
        `Line items total $${lineItemSum.toFixed(2)} but the invoice's totals section implies $${expected.toFixed(2)} -- a $${Math.abs(diff).toFixed(2)} gap that isn't explained by any specific issue above. Please verify against the original PDF before posting.`,
      );
    }
  }

  return {
    orderNumber,
    orderDate: orderDate ?? "",
    orderType,
    importerName,
    status,
    licensePremiseAddress,
    pickupDate,
    totalBottles,
    grossPrice,
    discountTotal,
    additionalOrderFee,
    taxableAmount,
    tax,
    freight,
    orderTotal,
    lineItems,
    warnings,
  };
}
