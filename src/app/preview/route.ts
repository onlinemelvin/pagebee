import { requireClient, AuthError } from "@/lib/auth/session";
import { getPreviewSiteForClient } from "@/lib/modules/website";
import { serveTenant } from "@/lib/site/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /preview — the signed-in client's own website preview (before launch).
 * Auth-gated and scoped to the caller's tenant: previews are never reachable on the
 * public host. Renders the generated HTML in preview mode (banner + noindex + demo).
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
  return serveTenant(site, req);
}
