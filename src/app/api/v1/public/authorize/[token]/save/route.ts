import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimited } from "@/lib/ratelimit";
import { savePlanCard, PaymentError } from "@/lib/modules/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  setupIntentId: z.string().min(1).max(200),
  mandateText: z.string().min(1).max(2000),
});

/** Extract the caller's IP from proxy headers (best-effort, for mandate evidence). */
function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

/**
 * POST /api/v1/public/authorize/{token}/save — after the SetupIntent confirms client-side, persist
 * the saved card against the plan plus the card-on-file mandate the customer accepted.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = await rateLimited(req, "plan-save-card", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const { token } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });

  try {
    await savePlanCard(token, { setupIntentId: parsed.data.setupIntentId, mandateText: parsed.data.mandateText, ip: clientIp(req) });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PaymentError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[POST /public/authorize/save]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
