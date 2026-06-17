import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { assertFeature } from "@/lib/auth/policy";
import { getDomainState, requestCustomDomain, removeCustomDomain } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ domain: z.string().min(1).max(253) });

// Map the service's machine reasons to a client-friendly message + HTTP status.
const REQUEST_ERRORS: Record<string, { status: number; message: string }> = {
  no_site: { status: 409, message: "Create your website before connecting a domain." },
  empty: { status: 400, message: "Enter a domain name." },
  invalid: { status: 400, message: "That doesn't look like a valid domain (e.g. yourbusiness.com)." },
  platform_domain: { status: 400, message: "That's a PageBee address — enter a domain you own." },
  taken: { status: 409, message: "That domain is already connected to another site." },
  in_progress: { status: 409, message: "You already have a domain in progress. Remove it first to change it." },
};

/** Resolve the owner + enforce the customDomain plan gate; returns the client or a NextResponse. */
async function gate() {
  try {
    const { client } = await requireOwner();
    assertFeature(client, "customDomain");
    return { client };
  } catch (err) {
    if (err instanceof AuthError) {
      return { res: NextResponse.json({ error: err.message }, { status: err.status }) };
    }
    throw err;
  }
}

/** GET /api/v1/client/website/domain — current custom-domain state + DNS records to set. */
export async function GET() {
  const g = await gate();
  if ("res" in g) return g.res;
  const state = await getDomainState(g.client.id);
  return NextResponse.json({ domain: state }, { headers: { "Cache-Control": "no-store" } });
}

/** POST /api/v1/client/website/domain — submit a domain to connect (enters admin review). */
export async function POST(req: Request) {
  const g = await gate();
  if ("res" in g) return g.res;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });
  }

  const result = await requestCustomDomain(g.client.id, parsed.data.domain);
  if (!result.ok) {
    const e = REQUEST_ERRORS[result.reason] ?? { status: 400, message: "Could not connect that domain." };
    return NextResponse.json({ error: result.reason, message: e.message }, { status: e.status });
  }
  return NextResponse.json({ ok: true, domain: result.state });
}

/** DELETE /api/v1/client/website/domain — disconnect the custom domain (back to subdomain). */
export async function DELETE() {
  const g = await gate();
  if ("res" in g) return g.res;
  await removeCustomDomain(g.client.id);
  return NextResponse.json({ ok: true });
}
