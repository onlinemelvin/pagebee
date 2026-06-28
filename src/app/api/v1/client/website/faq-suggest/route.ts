import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { suggestFaqs, FaqUnavailableError } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — suggest FAQ question/answer pairs from the business details (owner reviews/edits them). */
export async function POST(req: Request) {
  try {
    await requireCapability("website", "manage");
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  try {
    const faqs = await suggestFaqs(await req.json().catch(() => ({})));
    return NextResponse.json({ faqs });
  } catch (err) {
    if (err instanceof FaqUnavailableError) return NextResponse.json({ error: "ai_unavailable" }, { status: 503 });
    if (err instanceof ZodError) return NextResponse.json({ error: "validation_error" }, { status: 400 });
    console.error("[faq-suggest]", err);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
}
