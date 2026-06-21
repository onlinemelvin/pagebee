import { NextResponse } from "next/server";
import { unsubscribeCustomerByToken, verifyCustomerUnsubToken, setCustomerEmailConsent } from "@/lib/modules/email";
import { prisma } from "@/lib/db";
import { rateLimited } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function token(req: Request): string | null {
  return new URL(req.url).searchParams.get("token");
}

/** GET — resolve a customer unsubscribe token to the business name (confirm page). */
export async function GET(req: Request) {
  // Throttle token-validity probing (the GET confirms a token + leaks businessName).
  const limited = await rateLimited(req, "customer-unsub-get", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const t = token(req);
  if (!t) return NextResponse.json({ error: "missing_token" }, { status: 400 });
  const customerId = verifyCustomerUnsubToken(t);
  if (!customerId) return NextResponse.json({ error: "invalid_token" }, { status: 404 });
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { client: { select: { businessName: true } } } });
  if (!customer) return NextResponse.json({ error: "invalid_token" }, { status: 404 });
  return NextResponse.json({ businessName: customer.client.businessName });
}

/**
 * POST — opt the customer out of marketing email from this business. Doubles as
 * the RFC 8058 one-click endpoint (mail clients POST here directly), so it must
 * work without a session. `action=resubscribe` re-grants consent.
 */
export async function POST(req: Request) {
  // Mutates consent — rate-limit to blunt mass-toggle / brute-force abuse.
  const limited = await rateLimited(req, "customer-unsub-post", { limit: 15, windowMs: 60_000 });
  if (limited) return limited;
  const t = token(req);
  if (!t) return NextResponse.json({ error: "missing_token" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action === "resubscribe") {
    const customerId = verifyCustomerUnsubToken(t);
    if (!customerId) return NextResponse.json({ error: "invalid_token" }, { status: 404 });
    await setCustomerEmailConsent(customerId, true, "resubscribe_link");
    return NextResponse.json({ ok: true, state: "subscribed" });
  }

  const res = await unsubscribeCustomerByToken(t);
  if (!res) return NextResponse.json({ error: "invalid_token" }, { status: 404 });
  return NextResponse.json({ ok: true, state: "unsubscribed", businessName: res.businessName });
}
