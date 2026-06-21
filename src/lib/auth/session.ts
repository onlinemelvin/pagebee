import { cache } from "react";
import { prisma } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AuthError } from "./errors";
import { assertActiveAccount } from "./policy";
import { canView, canManage, type AreaAction } from "@/lib/modules/team/permissions";

// Re-exported so the many `import { AuthError } from "@/lib/auth/session"` callers keep working.
export { AuthError };

export interface AuthContext {
  userId: string; // our User.id (not the Supabase auth id)
  email: string;
  type: "PLATFORM" | "CLIENT";
  roles: string[];
  permissions: string[]; // permission keys granted via roles (e.g. "website:review")
  isAdmin: boolean;
}

/** True if the context grants a permission key. Admins implicitly have every permission. */
export function hasPermission(ctx: AuthContext, key: string): boolean {
  return ctx.isAdmin || ctx.permissions.includes(key);
}

/**
 * Resolve the current request's identity: read the Supabase session, then load
 * the matching platform User + roles. Returns null when not signed in.
 */
async function getAuthContextRaw(): Promise<AuthContext | null> {
  const supabase = await createSupabaseServerClient();
  // Verify the JWT locally (getClaims) instead of a network round-trip to the auth server
  // (getUser). getClaims validates the signature — as safe as getUser — and avoids the remote
  // call when the project uses asymmetric signing keys (falls back to getUser for legacy HS256).
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as { sub?: string; email?: string } | undefined;
  const email = typeof claims?.email === "string" ? claims.email : undefined;
  if (!email) return null;
  const supabaseUserId = typeof claims?.sub === "string" ? claims.sub : undefined;

  const dbUser = await prisma.user.findFirst({
    where: supabaseUserId ? { OR: [{ supabaseUserId }, { email }] } : { email },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
  });
  if (!dbUser || dbUser.status === "DISABLED") return null;

  const roles = dbUser.roles.map((ur) => ur.role.name);
  const permissions = [
    ...new Set(dbUser.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key))),
  ];
  return {
    userId: dbUser.id,
    email: dbUser.email,
    type: dbUser.type,
    roles,
    permissions,
    isAdmin: dbUser.type === "PLATFORM" && roles.includes("ADMIN"),
  };
}

/** For API routes: throws AuthError(401/403) when the caller isn't a platform admin. */
export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthError(401);
  if (!ctx.isAdmin) throw new AuthError(403);
  return ctx;
}

/**
 * For API routes: throws AuthError(401/403) unless the caller holds `key` (admins always do).
 * Lets us hand specific capabilities (e.g. website review) to a contractor role without
 * code changes — grant the role the permission and they're in. See docs/FEATURE_FLAGS.md.
 */
export async function requirePermission(key: string): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthError(401);
  if (!hasPermission(ctx, key)) throw new AuthError(403);
  return ctx;
}

/** Convenience: platform reviewer (or admin) — gates the website review queue + annotations. */
export function requireReview(): Promise<AuthContext> {
  return requirePermission("website:review");
}

/**
 * For client API routes: throws AuthError(401) when the caller has no client tenant, and (by
 * default) AuthError(402) when the tenant's account is suspended/cancelled — so account-status
 * enforcement is centralized here rather than repeated per route. Reactivation routes (billing
 * checkout, plan upgrade) pass `{ allowInactive: true }` so a blocked tenant can still pay.
 */
export async function requireClient(opts?: { allowInactive?: boolean }) {
  const result = await getCurrentClient();
  if (!result) throw new AuthError(401);
  if (!opts?.allowInactive) assertActiveAccount(result.client);
  return result; // { ctx, client, role }
}

/** For owner-only client actions: throws 401 (no tenant), 402 (inactive account), or 403 (staff). */
export async function requireOwner(opts?: { allowInactive?: boolean }) {
  const result = await requireClient(opts);
  if (result.role !== "owner") throw new AuthError(403);
  return result;
}

/**
 * For client feature routes: throws unless the caller may act on `area` at `action` level.
 * Owners hold every capability; staff are checked against their granted permissions
 * (see src/lib/modules/team/permissions.ts). `view` gates reads, `manage` gates writes.
 */
export async function requireCapability(
  area: string,
  action: AreaAction,
  opts?: { allowInactive?: boolean },
) {
  const result = await requireClient(opts);
  const ok = action === "manage" ? canManage(result.role, result.permissions, area) : canView(result.role, result.permissions, area);
  if (!ok) throw new AuthError(403);
  return result;
}

/** The client business (tenant) owned by the current user, with subscription + plan. */
async function getCurrentClientRaw() {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const membership = await prisma.clientUser.findFirst({
    where: { userId: ctx.userId },
    include: { client: { include: { subscription: { include: { plan: true } } } } },
  });
  return membership
    ? { ctx, client: membership.client, role: membership.role, permissions: membership.permissions }
    : null;
}

// Per-request memoization: layout + page + API guards in the same request resolve identity and
// tenant ONCE, instead of re-hitting Supabase auth + Prisma on every call. (React cache() is
// scoped to a single server request, so there's no cross-request staleness.)
export const getAuthContext = cache(getAuthContextRaw);
export const getCurrentClient = cache(getCurrentClientRaw);
