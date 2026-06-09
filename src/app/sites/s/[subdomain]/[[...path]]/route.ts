import { getPublishedSiteBySubdomain } from "@/lib/modules/website";
import { serveTenant } from "@/lib/site/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ subdomain: string; path?: string[] }> }) {
  const { subdomain, path } = await params;
  const site = await getPublishedSiteBySubdomain(subdomain);
  return serveTenant(site, req, path);
}
