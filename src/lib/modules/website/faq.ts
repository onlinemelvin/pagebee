import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const faqSuggestSchema = z.object({
  about: z.string().trim().max(2000).optional(),
  businessType: z.string().trim().max(120).optional(),
  services: z.array(z.string().trim().max(120)).max(30).optional(),
});
export type FaqSuggestInput = z.infer<typeof faqSuggestSchema>;
export type FaqSuggestion = { q: string; a: string };

/** Thrown when the model is unreachable/unconfigured vs. a genuine generation failure. */
export class FaqUnavailableError extends Error {
  constructor() {
    super("ai_unavailable");
  }
}

/**
 * Suggest 5–6 FAQ pairs from a business's details (the owner/rep reviews + edits them). Shared by the
 * client intake form (/api/v1/client/website/faq-suggest) and the rep preview form
 * (/api/v1/rep/website/faq-suggest) so both produce identical results. Grounded strictly on the facts
 * provided — never invents prices, hours, guarantees, etc. Throws FaqUnavailableError when the model
 * isn't configured; throws a plain Error on a generation failure.
 */
export async function suggestFaqs(input: FaqSuggestInput): Promise<FaqSuggestion[]> {
  if (!process.env.ANTHROPIC_API_KEY) throw new FaqUnavailableError();

  const { about, businessType, services } = faqSuggestSchema.parse(input);
  const facts = [
    businessType && `Business type: ${businessType}`,
    services?.length && `Services: ${services.join(", ")}`,
    about && `About: ${about}`,
  ]
    .filter(Boolean)
    .join("\n");

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
  return z
    .array(z.object({ q: z.string().min(1).max(300), a: z.string().min(1).max(1500) }))
    .max(8)
    .parse(raw);
}
