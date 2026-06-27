/** Shared display formatters for money + numbers. Keep all currency/number rendering consistent. */

/** Format a dollar amount (e.g. commission, salary). */
export function usd(dollars: number, opts?: { cents?: boolean }): string {
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts?.cents ? 2 : 0,
    maximumFractionDigits: opts?.cents ? 2 : 0,
  });
}

/** Format an integer-cents amount (e.g. quote/plan pricing) as dollars. */
export function usdFromCents(cents: number, opts?: { cents?: boolean }): string {
  return usd(cents / 100, opts);
}

/** Compact percentage from a 0..1 ratio. */
export function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
