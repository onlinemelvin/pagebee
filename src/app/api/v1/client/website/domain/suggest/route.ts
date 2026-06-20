import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, AuthError } from "@/lib/auth/session";
import { assertFeature } from "@/lib/auth/policy";
import { suggestDomainNames } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // AI ideas + per-domain availability checks

const schema = z.object({
  tlds: z.array(z.string().min(1).max(10)).max(6).optional(),
  keyword: z.string().max(60).optional(),
});

/** POST /api/v1/client/website/domain/suggest — AI domain ideas with availability + price. */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireOwner());
    assertFeature(client, "customDomain");
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });

  const suggestions = await suggestDomainNames(client.id, parsed.data);
  return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "no-store" } });
}
