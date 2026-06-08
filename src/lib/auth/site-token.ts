import { prisma } from "@/lib/db";

export interface ResolvedSite {
  websiteId: string;
  clientId: string;
  status: string;
}

/** Extract a site token from `Authorization: Bearer` or `x-site-token`. */
export function getSiteToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-site-token");
}

/**
 * Resolve a site token to its tenant. The returned `clientId` is the ONLY
 * tenant binding the public API trusts — never a clientId from the request body.
 */
export async function resolveSite(token: string | null): Promise<ResolvedSite | null> {
  if (!token) return null;
  const website = await prisma.website.findUnique({
    where: { siteToken: token },
    select: { id: true, clientId: true, status: true },
  });
  if (!website) return null;
  return { websiteId: website.id, clientId: website.clientId, status: website.status };
}
