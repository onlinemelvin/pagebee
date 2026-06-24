import { NextResponse } from "next/server";
import { rateLimited } from "@/lib/ratelimit";
import { registerClient, registerSchema, RegistrationError } from "@/lib/modules/registration";
import { getPostHogClient } from "@/lib/posthog-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/public/register — self-signup for a new client business. */
export async function POST(req: Request) {
  const limited = await rateLimited(req, "register", { limit: 6, windowMs: 600_000 });
  if (limited) return limited;

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
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: parsed.data.email,
      event: "client_registered",
      properties: {
        plan: parsed.data.plan,
        businessType: parsed.data.businessType,
        isTest: parsed.data.email.endsWith("@test.com"),
      },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof RegistrationError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    console.error("[POST /api/v1/public/register]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
