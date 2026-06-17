import Anthropic from "@anthropic-ai/sdk";
import { SERVICE_ICONS } from "@/lib/modules/service/schema";
import { CHEAP_MODEL, AI_FORCE_STUB } from "./models";

export interface ServiceMeta {
  /** A lucide icon key from SERVICE_ICONS. */
  icon: string;
  /** A short, business-tied description, or null when generation is unavailable. */
  description: string | null;
}

/** Cheap keyword → icon fallback used when the model is unavailable or returns junk. */
function fallbackIcon(name: string): string {
  const n = name.toLowerCase();
  const rules: [RegExp, string][] = [
    [/car|auto|vehicle|tire|brake|paint job|detail/, "car"],
    [/hair|cut|barber|salon|style/, "scissors"],
    [/clean|maid|wash/, "droplet"],
    [/plumb|pipe|drain|leak/, "droplet"],
    [/electric|wir|outlet/, "plug"],
    [/paint|coat/, "paintbrush"],
    [/repair|fix|install|service|mechanic/, "wrench"],
    [/build|construct|carpentr|renovat/, "hammer"],
    [/lawn|garden|tree|landscap/, "leaf"],
    [/photo|shoot/, "camera"],
    [/train|coach|fitness|gym/, "dumbbell"],
    [/tutor|lesson|class|teach/, "graduation-cap"],
    [/law|legal|attorney/, "scale"],
    [/health|medical|dental|doctor|therapy/, "stethoscope"],
    [/pet|dog|groom/, "dog"],
    [/food|cater|meal|restaurant/, "utensils"],
    [/consult|advis|account|tax/, "briefcase"],
  ];
  for (const [re, icon] of rules) if (re.test(n)) return icon;
  return "sparkles";
}

/**
 * Resolve an icon that isn't already used by the client's other services, so a catalog never
 * repeats icons. Prefers the desired pick; on a collision falls back to a keyword-matched icon,
 * then the first unused icon in the catalog; only repeats once the catalog (28 icons) is exhausted.
 */
export function uniqueIcon(desired: string, taken: Set<string>, serviceName: string): string {
  if (!taken.has(desired)) return desired;
  const fb = fallbackIcon(serviceName);
  if (!taken.has(fb)) return fb;
  for (const ic of SERVICE_ICONS) if (!taken.has(ic)) return ic;
  return desired; // more services than catalog icons — an unavoidable repeat
}

/**
 * Pick an icon and write a short description for a service from just its name, tied to the
 * specific business. Uses Claude when ANTHROPIC_API_KEY is set; otherwise falls back to a
 * keyword-matched icon and no description (never throws — the caller always gets usable meta).
 */
export async function generateServiceMeta(opts: {
  serviceName: string;
  businessName: string;
  businessType?: string | null;
  /** Icons already used by the client's other services — the model is asked to avoid them so the
   *  catalog doesn't repeat icons. (The caller still enforces uniqueness via `uniqueIcon`.) */
  exclude?: string[];
}): Promise<ServiceMeta> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const fallback: ServiceMeta = { icon: fallbackIcon(opts.serviceName), description: null };
  if (!apiKey || AI_FORCE_STUB) return fallback;

  try {
    const client = new Anthropic({ apiKey });
    const model = CHEAP_MODEL; // tiny structured task — the cheap tier is plenty
    const business = [opts.businessName, opts.businessType ? `(${opts.businessType})` : ""].filter(Boolean).join(" ");
    const system = [
      "You label a single service offered by a local business. Respond with ONLY a JSON object,",
      "no markdown or commentary, matching: { \"icon\": string, \"description\": string }.",
      `- "icon" MUST be exactly one of these keys: ${SERVICE_ICONS.join(", ")}. Pick the closest fit.`,
      ...(opts.exclude?.length
        ? [
            `- These icons are ALREADY used by other services on this catalog — pick a DIFFERENT, distinct one` +
              ` (only reuse if there is genuinely no other sensible fit): ${opts.exclude.join(", ")}.`,
          ]
        : []),
      '- "description" is one warm, concrete sentence (max ~140 chars) describing this service as offered',
      "  by THIS business. Use only what the name and business plainly imply — never invent prices,",
      "  guarantees, durations, or credentials.",
    ].join("\n");

    const res = await client.messages.create({
      model,
      max_tokens: 300,
      thinking: { type: "disabled" },
      system,
      messages: [
        {
          role: "user",
          content: JSON.stringify({ business: business || "a local business", service: opts.serviceName }),
        },
      ],
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const json = (text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text).trim();
    const parsed = JSON.parse(json) as { icon?: unknown; description?: unknown };

    const icon =
      typeof parsed.icon === "string" && (SERVICE_ICONS as readonly string[]).includes(parsed.icon)
        ? parsed.icon
        : fallback.icon;
    const description =
      typeof parsed.description === "string" && parsed.description.trim()
        ? parsed.description.trim().slice(0, 2000)
        : null;
    return { icon, description };
  } catch (err) {
    console.error("[ai] service meta generation failed; using fallback:", (err as Error)?.message);
    return fallback;
  }
}
