import OpenAI from "openai";
import { z } from "zod";

// ── Intake & plan limits ─────────────────────────────────────────────────────
export interface WebsiteIntake {
  businessName: string;
  businessType?: string | null;
  about?: string;
  services?: string[];
  serviceAreas?: string[];
  hours?: string;
  tone?: string;
  phone?: string | null;
  email?: string | null;
}

export interface PlanLimits {
  maxPages: number;
  booking: boolean;
  chat: boolean;
  payments: boolean;
  aiAssistant: boolean;
}

// ── Generated config schema (validated; the model must conform) ───────────────
const websiteConfigSchema = z.object({
  theme: z
    .object({
      style: z.string().default("clean"),
      primaryColor: z.string().default("#f59e0b"),
      secondaryColor: z.string().default("#1c1917"),
      fontStyle: z.string().default("modern"),
    })
    .default({ style: "clean", primaryColor: "#f59e0b", secondaryColor: "#1c1917", fontStyle: "modern" }),
  copy: z.object({
    heroHeadline: z.string().min(1),
    heroSubheadline: z.string().default(""),
    aboutText: z.string().default(""),
    services: z
      .array(z.object({ name: z.string(), description: z.string().default("") }))
      .default([]),
    faqs: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
    ctaText: z.string().default("Contact us"),
  }),
  pages: z
    .array(
      z.object({
        slug: z.string(),
        title: z.string(),
        seoTitle: z.string().optional(),
        metaDescription: z.string().optional(),
        sections: z.array(z.string()).default([]),
      }),
    )
    .min(1),
  seoTitle: z.string().default(""),
  metaDescription: z.string().default(""),
});

export type WebsiteConfig = z.infer<typeof websiteConfigSchema>;
export interface GenerateResult {
  config: WebsiteConfig;
  engine: "openai" | "stub";
}

const SHAPE = `{
  "theme": { "style": string, "primaryColor": hex, "secondaryColor": hex, "fontStyle": string },
  "copy": {
    "heroHeadline": string, "heroSubheadline": string, "aboutText": string,
    "services": [{ "name": string, "description": string }],
    "faqs": [{ "q": string, "a": string }],
    "ctaText": string
  },
  "pages": [{ "slug": string, "title": string, "seoTitle": string, "metaDescription": string, "sections": string[] }],
  "seoTitle": string, "metaDescription": string
}`;

/**
 * Generate a structured website configuration from business intake. Uses OpenAI
 * when OPENAI_API_KEY is set; otherwise a deterministic stub so the flow works
 * offline. Output is validated and never trusted to exceed the plan's page limit.
 */
export async function generateWebsiteConfig(
  intake: WebsiteIntake,
  limits: PlanLimits,
): Promise<GenerateResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const config = await generateWithOpenAI(intake, limits, apiKey);
      return { config, engine: "openai" };
    } catch (err) {
      console.error("[ai] OpenAI generation failed; using stub:", err);
    }
  }
  return { config: stubConfig(intake, limits), engine: "stub" };
}

async function generateWithOpenAI(
  intake: WebsiteIntake,
  limits: PlanLimits,
  apiKey: string,
): Promise<WebsiteConfig> {
  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const system = [
    "You are an expert website copywriter for local service businesses.",
    "Return ONLY valid JSON (no markdown) matching the requested shape exactly.",
    "Use ONLY facts present in the intake. Never invent services, prices, guarantees,",
    "licenses, certifications, or hours that were not provided.",
    "Write concise, warm, professional copy in the requested tone.",
    `Produce at most ${limits.maxPages} pages. Always include a home page ("/") and a contact page.`,
    "Each page's `sections` is a list of section names like Hero, About, Services, Gallery, FAQ, Contact.",
    `Required JSON shape:\n${SHAPE}`,
  ].join(" ");

  const res = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    max_tokens: 4000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify({ intake, maxPages: limits.maxPages }) },
    ],
  });

  const content = res.choices[0]?.message?.content ?? "{}";
  const config = websiteConfigSchema.parse(JSON.parse(content));
  config.pages = config.pages.slice(0, limits.maxPages);
  return config;
}

function stubConfig(intake: WebsiteIntake, limits: PlanLimits): WebsiteConfig {
  const services = (intake.services ?? []).map((name) => ({ name, description: "" }));
  const areas = intake.serviceAreas?.length ? ` in ${intake.serviceAreas.join(", ")}` : "";
  const pages = [
    { slug: "/", title: "Home", sections: ["Hero", "Services", "About", "Contact"] },
    { slug: "/services", title: "Services", sections: ["Services"] },
    { slug: "/about", title: "About", sections: ["About"] },
    { slug: "/contact", title: "Contact", sections: ["Contact"] },
  ].slice(0, limits.maxPages);

  return websiteConfigSchema.parse({
    theme: { style: "clean", primaryColor: "#f59e0b", secondaryColor: "#1c1917", fontStyle: "modern" },
    copy: {
      heroHeadline: intake.businessName,
      heroSubheadline: intake.businessType
        ? `Professional ${intake.businessType.toLowerCase()}${areas}.`
        : `Quality service you can count on${areas}.`,
      aboutText: intake.about ?? "",
      services,
      faqs: [],
      ctaText: "Get a free quote",
    },
    pages,
    seoTitle: intake.businessName,
    metaDescription: (intake.about ?? `${intake.businessName} — ${intake.businessType ?? "local business"}`).slice(0, 150),
  });
}
