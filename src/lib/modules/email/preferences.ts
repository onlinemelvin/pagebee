import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import type { EmailCategory } from "@prisma/client";
import { appBase } from "./layout";

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

function newToken(): string {
  return `uns_${crypto.randomBytes(24).toString("base64url")}`;
}

/**
 * Is this address suppressed from a given marketing category? Returns true when
 * there's an all-marketing opt-out (category = null) OR a category-specific one.
 * Transactional categories should never call this — they always send.
 */
export async function isSuppressed(email: string, category: EmailCategory): Promise<boolean> {
  const row = await prisma.emailUnsubscribe.findFirst({
    // `reason: "anchor"` rows merely hold a stable token and are NOT a suppression.
    where: { email: normalize(email), reason: { not: "anchor" }, OR: [{ category: null }, { category }] },
    select: { id: true },
  });
  return row !== null;
}

export interface UnsubscribeUrls {
  token: string;
  /** Human-facing confirmation page (footer link). */
  pageUrl: string;
  /** RFC 8058 one-click POST endpoint (List-Unsubscribe header). */
  oneClickUrl: string;
}

/**
 * Stable per-recipient unsubscribe token (one row, reused across sends). We mint
 * an inert "anchor" row to hold the token without actually suppressing, so the
 * same link works whether or not they've opted out yet.
 */
export async function unsubscribeUrlFor(email: string, clientId?: string | null): Promise<UnsubscribeUrls> {
  const norm = normalize(email);
  // Reuse any existing token for this address (suppression row or anchor).
  const existing = await prisma.emailUnsubscribe.findFirst({
    where: { email: norm },
    select: { token: true },
    orderBy: { createdAt: "asc" },
  });
  let token = existing?.token;
  if (!token) {
    token = newToken();
    await prisma.emailUnsubscribe.create({
      data: { email: norm, clientId: clientId ?? null, category: null, reason: "anchor", token },
    });
  }
  const b = appBase();
  return { token, pageUrl: `${b}/unsubscribe/${token}`, oneClickUrl: `${b}/api/v1/public/unsubscribe?token=${token}` };
}

/** Resolve an unsubscribe token to its address (for the public confirm page). */
export async function resolveUnsubscribeToken(token: string): Promise<{ email: string; clientId: string | null } | null> {
  const row = await prisma.emailUnsubscribe.findUnique({ where: { token }, select: { email: true, clientId: true } });
  return row ? { email: row.email, clientId: row.clientId } : null;
}

/**
 * Opt an address out of marketing. `category = undefined` opts out of ALL
 * marketing. Idempotent. Returns the affected email.
 */
export async function unsubscribe(
  token: string,
  opts: { category?: EmailCategory; reason?: string } = {},
): Promise<{ email: string } | null> {
  const anchor = await prisma.emailUnsubscribe.findUnique({ where: { token } });
  if (!anchor) return null;
  const email = anchor.email;

  if (opts.category) {
    await prisma.emailUnsubscribe.upsert({
      where: { email_category: { email, category: opts.category } },
      create: { email, clientId: anchor.clientId, category: opts.category, reason: opts.reason ?? "user", token: `uns_${crypto.randomBytes(24).toString("base64url")}` },
      update: { reason: opts.reason ?? "user" },
    });
  } else {
    // All-marketing opt-out: flip the anchor row into a real suppression.
    await prisma.emailUnsubscribe.update({
      where: { token },
      data: { category: null, reason: opts.reason ?? "user" },
    });
  }
  return { email };
}

/** Re-subscribe: clear suppression rows for an address (keeps an anchor token). */
export async function resubscribe(email: string): Promise<void> {
  const norm = normalize(email);
  await prisma.emailUnsubscribe.updateMany({ where: { email: norm }, data: { reason: "anchor" } });
}

/**
 * Record a hard suppression triggered by the provider (bounce/complaint). Keyed
 * to all marketing so we stop emailing a dead/complaining address.
 */
export async function suppressFromProvider(email: string, reason: "bounce" | "complaint"): Promise<void> {
  const norm = normalize(email);
  // Flip (or create) the single all-marketing row (category = null) — never touch
  // category-specific rows, which would risk colliding on the (email, null) key.
  const nullRow = await prisma.emailUnsubscribe.findFirst({ where: { email: norm, category: null }, select: { id: true } });
  if (nullRow) {
    await prisma.emailUnsubscribe.update({ where: { id: nullRow.id }, data: { reason } });
  } else {
    await prisma.emailUnsubscribe.create({ data: { email: norm, category: null, reason, token: newToken() } });
  }
}
