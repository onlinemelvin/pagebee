import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import type { AuthTokenType } from "@prisma/client";

const PREFIX: Record<AuthTokenType, string> = {
  PASSWORD_RESET: "prt",
  EMAIL_VERIFY: "evt",
  REP_INVITE: "rit",
};

function hash(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Mint a single-use auth token. Returns the RAW token (emailed once); only its
 * SHA-256 hash is persisted, so a DB leak can't be replayed. Any prior unused
 * tokens of the same type for this user are invalidated first.
 */
export async function createAuthToken(args: { userId: string; email: string; type: AuthTokenType; ttlMinutes: number }): Promise<string> {
  await prisma.authToken.updateMany({
    where: { userId: args.userId, type: args.type, usedAt: null },
    data: { usedAt: new Date() },
  });
  const raw = `${PREFIX[args.type]}_${crypto.randomBytes(32).toString("base64url")}`;
  await prisma.authToken.create({
    data: {
      userId: args.userId,
      email: args.email.trim().toLowerCase(),
      type: args.type,
      tokenHash: hash(raw),
      expiresAt: new Date(Date.now() + args.ttlMinutes * 60_000),
    },
  });
  return raw;
}

/**
 * Validate + consume a token. Marks it used (single-use) and returns the owning
 * user, or null when missing / expired / already used / wrong type.
 */
export async function consumeAuthToken(raw: string, type: AuthTokenType): Promise<{ userId: string; email: string } | null> {
  const row = await prisma.authToken.findUnique({ where: { tokenHash: hash(raw) } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) return null;
  const consumed = await prisma.authToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (consumed.count !== 1) return null; // lost a race — treat as already used
  return { userId: row.userId, email: row.email };
}
