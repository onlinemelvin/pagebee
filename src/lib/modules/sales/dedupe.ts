/**
 * Build a normalized fingerprint for a prospect from its business name, phone, and email. Used to
 * detect when two reps add the same business and to enforce the first-touch assignment lock
 * (anti lead-stealing — see docs/SALES_REP_PROGRAM.md §10). The key is intentionally lossy: it
 * collapses whitespace/case/punctuation and strips non-digits from the phone so trivial formatting
 * differences still collide.
 */
export function normalizeDedupeKey(input: {
  businessName: string;
  phone?: string | null;
  email?: string | null;
}): string {
  const name = input.businessName
    .trim()
    .toLowerCase()
    .replace(/[^\w ]/g, "")
    .replace(/\s+/g, " ");
  const phone = (input.phone ?? "").replace(/\D/g, "");
  const email = (input.email ?? "").trim().toLowerCase();
  return [name, phone, email].join("|");
}
