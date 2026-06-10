import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { UI_UX_DIRECTION } from "./ui-ux-direction";
import { SITE_TOKEN_PLACEHOLDER } from "./site-constants";
import { fetchMagicReferences, type MagicRef } from "./magic";
import { fetchStockImages, type StockImage } from "./stock";

export { SITE_TOKEN_PLACEHOLDER };

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
  revisionNote?: string;
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
  engine: "claude" | "stub";
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const config = await generateWithClaude(intake, limits, apiKey);
      return { config, engine: "claude" };
    } catch (err) {
      console.error("[ai] Claude generation failed; using stub:", err);
    }
  }
  return { config: stubConfig(intake, limits), engine: "stub" };
}

// ── Code-generated full site (HTML) wired to PageBee shared APIs ──────────────

function integrationContract(limits: PlanLimits): string {
  const lines = [
    "PAGEBEE SHARED API — wire ALL dynamic features to these same-origin endpoints.",
    "NEVER embed third-party payment, booking, or calendar widgets/SDKs; NEVER store data client-side.",
    `Auth header on every call: { "Authorization": "Bearer ${SITE_TOKEN_PLACEHOLDER}", "Content-Type": "application/json" }`,
    "- Contact / quote / inquiry (ALL plans): POST /api/v1/public/leads  body { type:'CONTACT_FORM'|'QUOTE_REQUEST'|'SERVICE_INQUIRY', name, email, phone?, message?, source:'site' }",
    "- Analytics (ALL plans): POST /api/v1/public/analytics/events  body { name, properties? }",
  ];
  if (limits.booking) {
    lines.push(
      "- Booking/calendar (ENABLED): GET /api/v1/public/booking/availability?service=<name> -> { slots:[{ startAt, label }] } ; POST /api/v1/public/bookings  body { serviceName, startAt, name, email, phone? }",
    );
  }
  if (limits.payments) {
    lines.push(
      "- Payments (ENABLED): POST /api/v1/public/payments/payment-link  body { amount, description } -> { url } ; point the pay button at the returned url",
    );
  }
  lines.push(`Use the literal placeholder ${SITE_TOKEN_PLACEHOLDER} for the token — substituted at serve time.`);
  return lines.join("\n");
}

const HTML_RULES = `
Output ONLY a single complete, self-contained, responsive HTML5 document (begin with <!DOCTYPE html>).
No markdown, no code fences, no commentary before or after.
- Load Tailwind via <script src="https://cdn.tailwindcss.com"></script> in <head>; Google Fonts via <link>. No other external scripts or SDKs.
- Use ONLY facts present in the intake. Never invent services, prices, guarantees, licenses, hours, or testimonials.
- Wire the contact/quote form to POST /api/v1/public/leads. On success, REPLACE the form with a clear, friendly confirmation (a checkmark + a line like "Your request has been received — we'll be in touch shortly") inside an aria-live="polite" region; on failure show a retry message. Disable the submit button while sending.
- BOOKING (only if the plan enables it): add a prominent, INDUSTRY-APPROPRIATE scheduling section — pick the heading/label to fit the business (e.g. "Book a test drive", "Reserve a table", "Schedule a consultation", "Book an appointment"). On load, fetch GET /api/v1/public/booking/availability and populate a <select> of times from the returned { slots:[{startAt,label}] } (option value=startAt, text=label); on submit POST /api/v1/public/bookings { serviceName, startAt, name, email, phone? } and show the same style of success confirmation.
- Mobile-first, semantic, accessible (labels, focus states, alt text).
- SEO: include a descriptive <title>, <meta name="description">, <link rel="canonical" href="__SITE_URL__/">, and Open Graph tags (og:title, og:description, og:url="__SITE_URL__", og:type="website"). One <h1>; use header/main/section/footer landmarks.
- IMAGERY: use the provided STOCK IMAGES (real royalty-free URLs) for the hero and section visuals, each with descriptive alt text and loading="lazy". If none are provided, use tasteful CSS gradients/patterns — NEVER emit broken or placeholder image URLs.
- ANIMATION — use Motion (the vanilla/standalone build of Framer Motion; works without React or a bundler). Load it once via a CDN ESM module and use its API for tasteful, production-grade motion:
    <script type="module">
      import { animate, inView, stagger } from "https://cdn.jsdelivr.net/npm/motion@11/+esm";
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        document.documentElement.classList.add("motion");           // gate hidden-initial styles on this
        inView("[data-reveal]", (el) => { animate(el, { opacity: [0, 1], transform: ["translateY(24px)", "translateY(0)"] }, { duration: 0.6, easing: "ease-out" }); }, { amount: 0.2 });
        // staggered entrances for grids/lists; subtle hover/tap micro-interactions where they help.
      }
    </script>
  Use it for scroll-reveal, staggered section/grid entrances (stagger()), and subtle hover/press feedback — transform/opacity only, elegant not flashy.
  CRITICAL accessibility/SEO: content MUST be fully visible WITHOUT JS. Only apply the hidden initial state under the JS-added class, e.g. \`html.motion [data-reveal]{opacity:0}\` — never a bare \`opacity:0\`. Skip ALL motion when prefers-reduced-motion is set.
`.trim();

/** Generate a complete code site (HTML) that calls PageBee shared APIs. Stub when no key. */
export async function generateSiteHtml(
  intake: WebsiteIntake,
  limits: PlanLimits,
): Promise<{ html: string; engine: "claude+magic" | "claude" | "stub" }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      // Pull reference components (21st.dev Magic) + stock photos (Pexels) in parallel; [] if unavailable.
      const [refs, images] = await Promise.all([
        fetchMagicReferences(buildMagicQueries(intake, limits)),
        fetchStockImages(buildImageQueries(intake)),
      ]);
      const html = await generateHtmlWithClaude(intake, limits, apiKey, refs, images);
      return { html, engine: refs.length ? "claude+magic" : "claude" };
    } catch (err) {
      console.error("[ai] Claude HTML generation failed; using stub:", err);
    }
  }
  return { html: stubHtml(intake), engine: "stub" };
}

function buildMagicQueries(intake: WebsiteIntake, limits: PlanLimits): string[] {
  const t = (intake.businessType ?? "local business").toLowerCase();
  const queries = [`hero section for a ${t}`, "services or features grid", "contact section with form"];
  if (limits.booking) queries.push("appointment booking section");
  return queries;
}

function buildImageQueries(intake: WebsiteIntake): string[] {
  const base = intake.businessType ?? "local business";
  return [base, ...(intake.services ?? [])].slice(0, 5);
}

async function generateHtmlWithClaude(
  intake: WebsiteIntake,
  limits: PlanLimits,
  apiKey: string,
  refs: MagicRef[] = [],
  images: StockImage[] = [],
): Promise<string> {
  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
  const parts = [UI_UX_DIRECTION, "", integrationContract(limits), "", HTML_RULES];
  if (refs.length) {
    parts.push(
      "",
      "REFERENCE COMPONENTS (from 21st.dev Magic). Adapt their structure and visual quality into your self-contained HTML: convert any React/shadcn/lucide into semantic HTML + Tailwind (inline SVG where needed). Do NOT import React/shadcn/lucide and do NOT leave JSX in the output.",
      ...refs.map((r) => `/* ${r.query} — ${r.componentName} */\n${r.code}`),
    );
  }
  if (images.length) {
    parts.push(
      "",
      'STOCK IMAGES (real royalty-free URLs — use for hero/section visuals with descriptive alt + loading="lazy"):',
      ...images.map((im) => `${im.url}  (alt: ${im.alt})`),
    );
  }
  if (intake.revisionNote) {
    parts.push(
      "",
      `REVISION REQUESTED by the business owner — apply this change while keeping everything else strong: ${intake.revisionNote}`,
    );
  }
  const system = parts.join("\n");

  const stream = client.messages.stream({
    model,
    max_tokens: 32000,
    thinking: { type: "disabled" },
    system,
    messages: [{ role: "user", content: JSON.stringify({ intake, maxPages: limits.maxPages }) }],
  });
  const message = await stream.finalMessage();

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const html = (fenced ? fenced[1] : text).trim();
  if (!/<html[\s>]/i.test(html)) throw new Error("model did not return an HTML document");
  return html;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function stubHtml(intake: WebsiteIntake): string {
  const services = (intake.services ?? [])
    .map((s) => `<li class="rounded-lg bg-stone-50 px-4 py-3">${escapeHtml(s)}</li>`)
    .join("");
  const areas = intake.serviceAreas?.length ? ` · Serving ${escapeHtml(intake.serviceAreas.join(", "))}` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(intake.businessName)}</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-white text-stone-900 antialiased">
<header class="border-b border-stone-200"><div class="mx-auto max-w-5xl px-6 h-16 flex items-center font-bold text-lg">${escapeHtml(intake.businessName)}</div></header>
<main>
  <section class="mx-auto max-w-5xl px-6 py-24 text-center">
    <h1 class="text-4xl sm:text-6xl font-extrabold tracking-tight">${escapeHtml(intake.businessName)}</h1>
    <p class="mt-4 text-lg text-stone-600">${escapeHtml(intake.businessType ?? "Quality service you can count on")}${areas}</p>
    <a href="#contact" class="mt-8 inline-block rounded-full bg-amber-500 px-8 py-4 font-semibold text-white">Get in touch</a>
  </section>
  ${services ? `<section class="mx-auto max-w-5xl px-6 py-16"><h2 class="text-2xl font-bold text-center">Our services</h2><ul class="mt-8 grid gap-3 sm:grid-cols-2">${services}</ul></section>` : ""}
  <section id="contact" class="bg-stone-50 py-20"><div class="mx-auto max-w-xl px-6">
    <h2 class="text-2xl font-bold text-center">Contact us</h2>
    <form id="lead-form" class="mt-8 grid gap-3">
      <input name="name" required placeholder="Your name" class="rounded-xl border border-stone-300 px-4 py-3"/>
      <input name="email" type="email" required placeholder="Email" class="rounded-xl border border-stone-300 px-4 py-3"/>
      <input name="phone" placeholder="Phone (optional)" class="rounded-xl border border-stone-300 px-4 py-3"/>
      <textarea name="message" placeholder="How can we help?" class="rounded-xl border border-stone-300 px-4 py-3"></textarea>
      <button type="submit" class="rounded-full bg-amber-500 px-6 py-3 font-semibold text-white">Send</button>
      <p id="lead-status" class="text-sm text-center"></p>
    </form>
  </div></section>
</main>
<footer class="border-t border-stone-200 py-8 text-center text-sm text-stone-500">Powered by PageBee</footer>
<script>
document.getElementById('lead-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  var f = e.target; var d = new FormData(f);
  var status = document.getElementById('lead-status');
  status.textContent = 'Sending…';
  try {
    var res = await fetch('/api/v1/public/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ${SITE_TOKEN_PLACEHOLDER}' },
      body: JSON.stringify({ type: 'CONTACT_FORM', name: d.get('name'), email: d.get('email'), phone: d.get('phone') || undefined, message: d.get('message') || undefined, source: 'site' })
    });
    if (!res.ok) throw new Error(String(res.status));
    f.reset(); status.textContent = "Thanks — we'll be in touch.";
  } catch (err) { status.textContent = 'Something went wrong. Please try again.'; }
});
</script>
</body>
</html>`;
}

async function generateWithClaude(
  intake: WebsiteIntake,
  limits: PlanLimits,
  apiKey: string,
): Promise<WebsiteConfig> {
  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

  const system = [
    "You are an expert website copywriter for local service businesses.",
    "Respond with ONLY a single valid JSON object and nothing else — no markdown, no code fences, no commentary.",
    "Use ONLY facts present in the intake. Never invent services, prices, guarantees,",
    "licenses, certifications, or hours that were not provided.",
    "Write concise, warm, professional copy in the requested tone.",
    `Produce at most ${limits.maxPages} pages. Always include a home page ("/") and a contact page.`,
    "Each page's `sections` is a list of section names like Hero, About, Services, Gallery, FAQ, Contact.",
    `Required JSON shape:\n${SHAPE}`,
  ].join(" ");

  const res = await client.messages.create({
    model,
    max_tokens: 8000,
    thinking: { type: "disabled" },
    system,
    messages: [{ role: "user", content: JSON.stringify({ intake, maxPages: limits.maxPages }) }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const json = (fenced ? fenced[1] : text).trim();

  const config = websiteConfigSchema.parse(JSON.parse(json));
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
