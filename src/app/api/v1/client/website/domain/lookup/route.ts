import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { assertFeature } from "@/lib/auth/policy";
import { lookupDomain } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ domain: z.string().min(1).max(253) });

const ERRORS: Record<string, { status: number; message: string }> = {
  empty: { status: 400, message: "Enter a domain name." },
  invalid: { status: 400, message: "That doesn't look like a valid domain (e.g. yourbusiness.com)." },
  platform_domain: { status: 400, message: "That's a PageBee address — enter a domain you'd own." },
  registrar_unavailable: { status: 503, message: "Domain search isn't available right now." },
  lookup_failed: { status: 502, message: "Couldn't check that domain. Try again." },
};

/** POST /api/v1/client/website/domain/lookup — availability + registration price for one domain. */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireOwner());
    assertFeature(client, "customDomain");
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });

  const r = await lookupDomain(parsed.data.domain);
  if (!r.ok) {
    const e = ERRORS[r.reason] ?? { status: 400, message: "Couldn't check that domain." };
    return NextResponse.json({ error: r.reason, message: e.message }, { status: e.status });
  }
  return NextResponse.json({ result: r.result }, { headers: { "Cache-Control": "no-store" } });
}
