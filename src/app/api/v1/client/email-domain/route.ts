import { NextResponse } from "next/server";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { assertFeature } from "@/lib/auth/policy";
import { getSendingDomain, provisionSendingDomain, checkSendingDomain, removeSendingDomain, SendingDomainError } from "@/lib/modules/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolve the owner + enforce the customDomain plan gate (a custom sending
 * domain is a CONNECT/AUTOMATE capability). Returns the client or a NextResponse.
 */
async function gate() {
  try {
    const { client } = await requireOwner();
    assertFeature(client, "customDomain");
    return { client };
  } catch (err) {
    if (err instanceof AuthError) return { res: NextResponse.json({ error: err.message }, { status: err.status }) };
    throw err;
  }
}

/** GET /api/v1/client/email-domain — current sending-domain status + DNS records. */
export async function GET() {
  const g = await gate();
  if ("res" in g) return g.res;
  const row = await getSendingDomain(g.client.id);
  return NextResponse.json({ sendingDomain: row });
}

/**
 * POST /api/v1/client/email-domain?action=provision|verify|remove
 * Owner sets up / re-checks / removes sending customer email from their own domain.
 */
export async function POST(req: Request) {
  const g = await gate();
  if ("res" in g) return g.res;
  const action = new URL(req.url).searchParams.get("action") ?? "provision";
  const clientId = g.client.id;

  try {
    if (action === "remove") {
      await removeSendingDomain(clientId);
      return NextResponse.json({ ok: true });
    }
    if (action === "verify") {
      const row = await getSendingDomain(clientId);
      if (!row) return NextResponse.json({ error: "not_provisioned" }, { status: 404 });
      const updated = await checkSendingDomain(row.id);
      return NextResponse.json({ sendingDomain: updated });
    }
    // Default: provision (idempotent).
    const row = await provisionSendingDomain(clientId);
    return NextResponse.json({ sendingDomain: row }, { status: 201 });
  } catch (err) {
    if (err instanceof SendingDomainError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[POST /api/v1/client/email-domain]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
