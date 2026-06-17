import { requireClient, AuthError } from "@/lib/auth/session";
import { getPreviewSiteForClient } from "@/lib/modules/website";
import { serveTenant, serveReviewFrame } from "@/lib/site/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /preview/frame — the raw preview document for the signed-in client, embedded in an
 * iframe by the /preview review page. Auth-gated and scoped to the caller's tenant; previews
 * are never reachable on the public host. `?annotate=1` serves the markup variant (annotate
 * bridge, no banner) the review page's comment footer talks to; without it, the plain
 * preview-mode document (banner + noindex + demo).
 */
export async function GET(req: Request) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) {
      return new Response(null, { status: 302, headers: { Location: "/login" } });
    }
    throw err;
  }

  const site = await getPreviewSiteForClient(client.id);
  const annotate = new URL(req.url).searchParams.get("annotate") === "1";
  if (annotate && site) return serveReviewFrame(site.html, site.siteToken, req, site.leadForm, site.booking);
  return serveTenant(site, req);
}
