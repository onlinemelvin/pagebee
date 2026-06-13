/**
 * Pure money math for finance documents. All amounts are integer cents; all percentages are
 * basis points (850 = 8.50%). No rounding drift: each line is rounded independently, totals sum
 * the rounded parts. Keep this module free of I/O so it stays trivially testable.
 */

export type DiscountKind = "PERCENT" | "FIXED";

export interface LineInput {
  quantity: number;
  unitAmount: number; // cents
  discountType?: DiscountKind | null;
  discountValue?: number; // PERCENT → basis points, FIXED → cents
  taxRateBps?: number; // 0 = no tax
  taxInclusive?: boolean; // true → tax is embedded in unitAmount
}

export interface LineComputed {
  gross: number; // quantity * unitAmount
  discount: number; // line-level discount applied
  amount: number; // gross − discount (pre-tax)
  taxAmount: number; // tax for this line (added on top unless inclusive)
  taxInclusive: boolean;
}

export interface DocTotals {
  lines: LineComputed[];
  subtotal: number; // Σ line.amount
  discountTotal: number; // invoice-level discount
  tax: number; // tax added on top (exclusive lines only)
  total: number; // subtotal − discountTotal + tax
}

/** Apply a percent (basis points) or fixed (cents) discount to a base, never exceeding it. */
export function applyDiscount(base: number, type: DiscountKind | null | undefined, value: number | undefined): number {
  if (!type || !value) return 0;
  if (type === "PERCENT") return Math.min(base, Math.round((base * value) / 10_000));
  return Math.min(base, Math.max(0, Math.round(value)));
}

/** Compute every line and the document totals from raw inputs. */
export function computeTotals(lines: LineInput[], invoiceDiscount?: { type?: DiscountKind | null; value?: number }): DocTotals {
  const computed: LineComputed[] = lines.map((l) => {
    const gross = Math.max(0, Math.round((l.quantity || 0) * (l.unitAmount || 0)));
    const discount = applyDiscount(gross, l.discountType, l.discountValue);
    const amount = gross - discount;
    return { gross, discount, amount, taxAmount: 0, taxInclusive: Boolean(l.taxInclusive) };
  });

  const subtotal = computed.reduce((s, l) => s + l.amount, 0);
  const discountTotal = applyDiscount(subtotal, invoiceDiscount?.type, invoiceDiscount?.value);

  let exclusiveTax = 0;
  computed.forEach((l, i) => {
    const bps = lines[i].taxRateBps ?? 0;
    if (!bps || subtotal <= 0) return;
    // Spread the invoice-level discount across lines proportionally, then tax the net.
    const share = l.amount / subtotal;
    const taxable = l.amount - discountTotal * share;
    if (l.taxInclusive) {
      const rate = bps / 10_000;
      l.taxAmount = Math.round(taxable - taxable / (1 + rate)); // extract embedded tax (display only)
    } else {
      l.taxAmount = Math.round((taxable * bps) / 10_000);
      exclusiveTax += l.taxAmount;
    }
  });

  const total = subtotal - discountTotal + exclusiveTax;
  return { lines: computed, subtotal, discountTotal, tax: exclusiveTax, total };
}

/** Format integer cents as a currency string (display helper). */
export function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}
