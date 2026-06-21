import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { requireCapability, AuthError } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  about: z.string().trim().max(2000).optional(),
  businessType: z.string().trim().max(120).optional(),
  services: z.array(z.string().trim().max(120)).max(30).optional(),
});

/** POST — suggest FAQ question/answer pairs from the business details (owner reviews/edits them). */
export async function POST(req: Request) {
  try {
    await requireCapability("website", "manage");
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ai_unavailable" }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });
  const { about, businessType, services } = parsed.data;

  const facts = [
    businessType && `Business type: ${businessType}`,
    services?.length && `Services: ${services.join(", ")}`,
    about && `About: ${about}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system:
        "You write concise, helpful FAQ entries for a local business website. " +
        "Base every answer ONLY on the facts provided — never invent prices, guarantees, hours, licenses, or specifics not given. " +
        "Keep answers 1–3 sentences, friendly and plain. Return STRICT JSON only.",
      messages: [
        {
          role: "user",
          content:
            `From these business details, write 5–6 common customer FAQs.\n\n${facts}\n\n` +
            `Respond with ONLY a JSON array: [{"q":"…","a":"…"}, …]. No prose, no markdown.`,
        },
      ],
    });

    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("no_json");
    const raw = JSON.parse(match[0]) as unknown;
    const faqs = z
      .array(z.object({ q: z.string().min(1).max(300), a: z.string().min(1).max(1500) }))
      .max(8)
      .parse(raw);

    return NextResponse.json({ faqs });
  } catch (err) {
    console.error("[faq-suggest]", err);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
}
