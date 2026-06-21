import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { setServiceDisplay } from "@/lib/modules/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ showPrice: z.boolean().optional(), showDuration: z.boolean().optional() });

/** POST /api/v1/client/services/display — toggle whether the live site shows service price / time. */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireCapability("website", "manage"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });

  const display = await setServiceDisplay(client.id, parsed.data);
  return NextResponse.json({ display });
}
