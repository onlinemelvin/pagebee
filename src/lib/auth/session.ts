import { prisma } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AuthContext {
  userId: string; // our User.id (not the Supabase auth id)
  email: string;
  type: "PLATFORM" | "CLIENT";
  roles: string[];
  isAdmin: boolean;
}

export class AuthError extends Error {
  constructor(public status: 401 | 403) {
    super(status === 401 ? "unauthorized" : "forbidden");
  }
}

/**
 * Resolve the current request's identity: read the Supabase session, then load
 * the matching platform User + roles. Returns null when not signed in.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const dbUser = await prisma.user.findFirst({
    where: { OR: [{ supabaseUserId: user.id }, { email: user.email }] },
    include: { roles: { include: { role: true } } },
  });
  if (!dbUser || dbUser.status === "DISABLED") return null;

  const roles = dbUser.roles.map((ur) => ur.role.name);
  return {
    userId: dbUser.id,
    email: dbUser.email,
    type: dbUser.type,
    roles,
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

/** For client API routes: throws AuthError(401) when the caller has no client tenant. */
export async function requireClient() {
  const result = await getCurrentClient();
  if (!result) throw new AuthError(401);
  return result; // { ctx, client }
}

/** The client business (tenant) owned by the current user, with subscription + plan. */
export async function getCurrentClient() {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const membership = await prisma.clientUser.findFirst({
    where: { userId: ctx.userId },
    include: { client: { include: { subscription: { include: { plan: true } } } } },
  });
  return membership ? { ctx, client: membership.client } : null;
}
