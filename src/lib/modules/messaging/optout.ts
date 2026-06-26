import { prisma } from "@/lib/db";

/**
 * SMS opt-out (STOP) handling — TCPA compliance. We keep our own suppression list (SmsOptOut) in
 * addition to whatever Twilio's Advanced Opt-Out does at its edge, so we NEVER attempt a send to a
 * number that's opted out, and we have an auditable record. Opt-out is global per E.164 number.
 */

// Carrier-recognized opt-out / opt-in / help keywords (case-insensitive, trimmed).
const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "stop all"]);
const START_WORDS = new Set(["start", "unstop", "yes", "resume"]);
const HELP_WORDS = new Set(["help", "info"]);

export type InboundKeyword = "stop" | "start" | "help" | null;

/** Classify an inbound SMS body as a STOP / START / HELP keyword (or null for anything else). */
export function classifyInbound(body: string): InboundKeyword {
  const w = body.trim().toLowerCase();
  if (STOP_WORDS.has(w)) return "stop";
  if (START_WORDS.has(w)) return "start";
  if (HELP_WORDS.has(w)) return "help";
  return null;
}

/**
 * Normalize a phone to E.164 (best-effort). Keeps a leading "+"; strips spaces, dashes, parens.
 * A bare 10-digit number is assumed US/Canada (+1) — the only region we send to at launch. Returns
 * null when there aren't enough digits to be a real number. Centralized so the opt-out key and the
 * send path always agree on the same string.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7) return null;
  if (hasPlus) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

/** Is this number suppressed (texted STOP / admin-suppressed)? Safe on bad input (returns false). */
export async function isOptedOut(phone: string | null | undefined): Promise<boolean> {
  const e164 = normalizePhone(phone);
  if (!e164) return false;
  const row = await prisma.smsOptOut.findUnique({ where: { phone: e164 }, select: { id: true } }).catch(() => null);
  return row !== null;
}

/** Suppress a number (idempotent). Called from the inbound STOP webhook or an admin action. */
export async function recordOptOut(phone: string, opts: { clientId?: string | null; reason?: string } = {}): Promise<void> {
  const e164 = normalizePhone(phone);
  if (!e164) return;
  await prisma.smsOptOut.upsert({
    where: { phone: e164 },
    create: { phone: e164, clientId: opts.clientId ?? null, reason: opts.reason ?? "user" },
    update: { reason: opts.reason ?? "user" },
  });
}

/** Re-enable a number (START): remove its suppression row. Idempotent. */
export async function recordOptIn(phone: string): Promise<void> {
  const e164 = normalizePhone(phone);
  if (!e164) return;
  await prisma.smsOptOut.deleteMany({ where: { phone: e164 } });
}
