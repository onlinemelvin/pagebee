import { NextResponse } from "next/server";
import { registerClient, registerSchema, RegistrationError } from "@/lib/modules/registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/public/register — self-signup for a new client business. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await registerClient(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof RegistrationError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    console.error("[POST /api/v1/public/register]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
