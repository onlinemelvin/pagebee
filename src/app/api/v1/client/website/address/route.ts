import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { getWebsiteAddress, checkSubdomain, setSubdomain } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the client's current subdomain + the platform root domain. */
export async function GET() {
  let client;
  try {
    ({ client } = await requireOwner({ allowInactive: true }));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  return NextResponse.json(await getWebsiteAddress(client.id));
}

const schema = z.object({ subdomain: z.string().min(1).max(63), check: z.boolean().optional() });

/** POST — check availability (`check: true`) or set the subdomain. */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireOwner({ allowInactive: true }));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });

  if (parsed.data.check) {
    return NextResponse.json(await checkSubdomain(client.id, parsed.data.subdomain));
  }
  try {
    return NextResponse.json({ ok: true, ...(await setSubdomain(client.id, parsed.data.subdomain)) });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "failed";
    return NextResponse.json({ error: reason }, { status: reason === "no_website" ? 409 : 400 });
  }
}
