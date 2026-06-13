/** Client-safe money helpers (no server imports). Cents ↔ dollar-string + display formatting. */
export function fmt(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format((cents || 0) / 100);
}
export function toCents(dollars: string | number): number {
  const n = typeof dollars === "number" ? dollars : parseFloat(dollars);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
export function toDollars(cents: number): string {
  return ((cents || 0) / 100).toFixed(2);
}
