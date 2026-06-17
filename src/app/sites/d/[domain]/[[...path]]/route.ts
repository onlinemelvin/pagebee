import { getServeSiteByDomain } from "@/lib/modules/website";
import { serveTenant } from "@/lib/site/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ domain: string; path?: string[] }> }) {
  const { domain, path } = await params;
  const site = await getServeSiteByDomain(decodeURIComponent(domain));
  return serveTenant(site, req, path);
}
