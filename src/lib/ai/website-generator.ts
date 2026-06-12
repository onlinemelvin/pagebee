import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { UI_UX_DIRECTION } from "./ui-ux-direction";
import { SITE_TOKEN_PLACEHOLDER } from "./site-constants";
import { fetchMagicReferences, type MagicRef } from "./magic";
import { fetchStockImages, type StockImage } from "./stock";
import { inlineTailwind, recompileTailwind } from "@/lib/site/tailwind";

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
  colorPalette?: string;
  pages?: string[];
  logoUrl?: string;
  imageUrls?: string[];
  /** Photos the owner chose for the Gallery section/page specifically. */
  galleryImageUrls?: string[];
  customInstructions?: string;
  revisionNote?: string;
  /** Primary call to action the owner chose for the site (Connect+ only). Steers the lead
   *  form's heading, fields, and `type`. Empty/undefined means "let the AI infer". */
  primaryGoal?: string;
}

export interface PlanLimits {
  maxPages: number;
  /** Whether the plan allows ANY lead-capture forms on the site. Launch = false:
   *  the contact section shows click-to-call / email only, never a form. */
  forms: boolean;
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
  ];
  if (limits.forms) {
    lines.push(
      "- Lead capture (ENABLED): POST /api/v1/public/leads  body { type:'CONTACT_FORM'|'QUOTE_REQUEST'|'SERVICE_INQUIRY', name, email, phone?, message?, source:'site' }",
    );
  }
  lines.push(
    "- Analytics (ALL plans): POST /api/v1/public/analytics/events  body { name, properties? }",
  );
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

/**
 * Per-site lead-capture rules. On plans without forms (Launch) the site is a brochure:
 * NO forms at all, contact = click-to-call / email. On form-enabled plans, build one
 * primary form steered by the owner's chosen primary goal (or inferred when unset).
 */
function leadCaptureDirective(intake: WebsiteIntake, limits: PlanLimits): string {
  if (!limits.forms) {
    return [
      "LEAD CAPTURE — DISABLED on this plan. Do NOT render ANY form anywhere on the site:",
      "no contact form, no quote form, no newsletter signup, no <input>/<textarea>/submit that",
      "collects visitor data, and do NOT call /api/v1/public/leads.",
      "The Contact section/page must instead present the business's own contact details directly:",
      "show the email as a clickable mailto: link and the phone as a clickable tel: link (use whichever",
      "are provided), alongside hours and service areas if available. Every call-to-action button",
      `("Get in touch", "Call us", "Email us", etc.) must link to tel: or mailto: — NEVER to a form.`,
    ].join("\n");
  }
  const goal = intake.primaryGoal?.trim();
  const goalLine = goal
    ? `The owner's chosen primary goal for the site is: "${goal}". Tailor the form's heading, button, and fields to it.`
    : "The owner did not specify a primary goal — infer the most fitting primary action from the business type and services (e.g. a quote for a contractor, a callback for a trade, a general message for a shop).";
  return [
    "LEAD CAPTURE — ENABLED. Include ONE primary lead form wired to POST /api/v1/public/leads.",
    goalLine,
    "Choose the lead `type` to match: a quote/estimate → 'QUOTE_REQUEST'; a callback/consultation/demo/",
    "availability or service question → 'SERVICE_INQUIRY'; a general message → 'CONTACT_FORM'.",
    "Add ONLY the few extra fields that goal needs (e.g. service of interest, preferred date/time, job scope)",
    "and fold their values into the `message` as readable lines — do not invent new API fields.",
    `On success, REPLACE the form with a clear, friendly confirmation (a checkmark + a line like "Your request`,
    `has been received — we'll be in touch shortly") inside an aria-live="polite" region; on failure show a`,
    "retry message. Disable the submit button while sending.",
    `IMPORTANT — preview handling: parse the JSON response; if it has "demo": true the site is an unpublished`,
    `preview and the message was NOT delivered. In that case do NOT show the success confirmation — instead show`,
    `a neutral notice like "Preview mode — this form isn't live yet, so your message was not sent." Only show the`,
    "real success confirmation when the response is not a demo.",
    "Also surface the business email/phone as click-to-call / mailto for visitors who'd rather reach out directly.",
  ].join("\n");
}

const HTML_RULES = `
Output ONLY a single complete, self-contained, responsive HTML5 document (begin with <!DOCTYPE html>).
No markdown, no code fences, no commentary before or after.
- Load Tailwind via <script src="https://cdn.tailwindcss.com"></script> in <head>; Google Fonts via <link>. No other external scripts or SDKs.
  IMPORTANT: PageBee PRECOMPILES your Tailwind classes into a static stylesheet ahead of serve time (Tailwind v4) and removes that CDN script. So: (1) keep the CDN <script> tag (it is the fallback) but do NOT add an inline "tailwind.config = {…}" script — it will be stripped and would break. (2) Define custom brand colors/fonts in a plain <style> block using CSS variables (e.g. :root{--brand:#…}) and reference them via arbitrary values (bg-[var(--brand)], text-[var(--brand)]) or hex arbitrary values (bg-[#0d9488]). (3) Prefer explicit-scale utilities (rounded-xl/2xl, shadow-md/lg, blur-md) over the bare rounded/shadow/blur, and use the slash opacity syntax (bg-black/5, text-white/80) — these are stable across the compile. Set base body font via the <style> block, not a Tailwind font-family config.
- Use ONLY facts present in the intake. Never invent services, prices, guarantees, licenses, hours, or testimonials.
- The LEAD CAPTURE directive below states whether this site may use forms at all, and (if so) what the primary form should be. Follow it exactly.
- BOOKING (only if the plan enables it): add a prominent, INDUSTRY-APPROPRIATE scheduling section — pick the heading/label to fit the business (e.g. "Book a test drive", "Reserve a table", "Schedule a consultation", "Book an appointment"). On load, fetch GET /api/v1/public/booking/availability and populate a <select> of times from the returned { slots:[{startAt,label}] } (option value=startAt, text=label); on submit POST /api/v1/public/bookings { serviceName, startAt, name, email, phone? } and show the same style of success confirmation.
- Mobile-first, semantic, accessible (labels, focus states, alt text).
- CHOOSE THE LAYOUT — the requested items are "pages OR sections" (content units). YOU decide how to present them based on how much real content the business has; do NOT default to multi-page:
    • SINGLE-PAGE (one scrolling page with anchor nav) — the right choice for most small/simple local businesses (a handful of services, a short story, contact). Make each unit a <section id="services"> etc., and a sticky nav of in-page anchor links (<a href="#services">). This usually feels the most modern and is the strongest default unless there's a clear reason to split.
    • MULTI-PAGE (separate routes) — choose this only when the content is genuinely substantial and benefits from its own URL (rich service catalog, gallery, pricing, team, long FAQ). See the multi-page contract below.
    • HYBRID — a multi-page site where some pages bundle several sections (e.g. Home = Hero + Services + Testimonials sections; About and Contact are their own pages). Combine the two techniques.
  Match the choice to the business: a solo plumber → single-page; a multi-service clinic or a restaurant with menu/gallery/events → multi-page or hybrid.
- MULTI-PAGE CONTRACT (only when you choose multi-page/hybrid). Wrap each page in a plain block container and let the PLATFORM route it — do NOT write routing JS, do NOT pre-hide pages with display:none/hidden:
    <div data-page="/" data-title="Home — {Business Name}"> …home (may contain several sections)… </div>
    <div data-page="/about" data-title="About — {Business Name}"> …about… </div>
  The HOME page MUST be the FIRST [data-page] and use data-page="/". Use clean lowercase hyphenated paths (/about, /services, /gallery). data-title sets that page's tab title. Nav links use REAL paths (<a href="/about">). PageBee injects a router that shows the matching page, animates the transition, marks the active link (class "is-active"), closes the mobile menu, and wires deep links + back/forward. Keep ALL pages in the DOM (crawlable). In-page #anchor links to sections WITHIN the current page still work normally.
- NAVIGATION (both layouts) — a sticky <header> with a <nav>, the logo/business name linking home, and the primary CTA repeated. Add CSS so the class "is-active" (set by the platform — on the current page link in multi-page, or the in-view section link in single-page) is clearly distinct (color/underline/weight). Provide a mobile menu: a <button aria-controls="mobile-menu" aria-expanded="false"> toggling a panel <... id="mobile-menu" data-menu hidden>; you MAY write the small toggle handler (flip aria-expanded + the panel's hidden attribute). A matching <footer> repeats the nav + contact/hours/areas. The platform highlights nav links and closes the mobile menu for you in BOTH layouts.
- SEO: include a descriptive <title>, <meta name="description">, <link rel="canonical" href="__SITE_URL__/">, and Open Graph tags (og:title, og:description, og:url="__SITE_URL__", og:type="website"). One <h1> on a single-page site (one per page in multi-page); use header/main/section/footer landmarks.
- IMAGERY: use the provided STOCK IMAGES (real royalty-free URLs) for the hero and section visuals, each with descriptive alt text and loading="lazy". If none are provided, use tasteful CSS gradients/patterns — NEVER emit broken or placeholder image URLs.
- SCROLL-REVEAL — the PLATFORM owns it. Just mark elements that should fade/rise in on scroll with the data-reveal attribute (e.g. <section data-reveal>, or each card in a grid). PageBee injects a controller at serve time that reveals above-the-fold content INSTANTLY (no blank first paint), fades in below-the-fold content as it scrolls into view, and respects prefers-reduced-motion.
  CRITICAL — do NOT hide [data-reveal] elements yourself: never set opacity:0 / visibility:hidden / display:none on them in CSS, and never hide them in JS. They must render visible by default so the page is never blank if scripts are slow; the platform handles the hide+reveal for off-screen ones. Use data-reveal generously but do not over-stagger (group a grid's cards, not every word).
- MICRO-INTERACTIONS — optionally use Motion (standalone Framer Motion, no React/bundler) for tasteful hover/press feedback, count-ups, or marquee — NOT for scroll-reveal (the platform does that). If you use it, load it lazily and guard it so it can never blank the page:
    <script type="module">
      try {
        const { animate } = await import("https://cdn.jsdelivr.net/npm/motion@11/+esm");
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          // subtle hover/press only, transform/opacity — e.g. lift a card on hover.
        }
      } catch (e) { /* no-op: the page is already fully visible without it */ }
    </script>
  Transform/opacity only, elegant not flashy. Never autoplay media. Always respect prefers-reduced-motion.
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
      // Precompile Tailwind to a static <style> (drops the render-blocking CDN). No-op fallback.
      return { html: await inlineTailwind(html), engine: refs.length ? "claude+magic" : "claude" };
    } catch (err) {
      console.error("[ai] Claude HTML generation failed; using stub:", err);
    }
  }
  return { html: await inlineTailwind(stubHtml(intake, limits)), engine: "stub" };
}

/** A single anchored change request from a review pin. */
export interface HtmlEditRequest {
  pagePath: string;
  selector?: string | null;
  anchorText?: string | null;
  /** The change the reviewer asked for (the comment body). */
  instruction: string;
}

const EDIT_SHAPE = `{ "edits": [ { "find": "<exact substring copied VERBATIM from the CURRENT HTML, long enough to occur exactly once>", "replace": "<the new HTML for just that snippet>", "note": "<which request this satisfies>" } ] }`;

/**
 * Surgically apply review pins to an EXISTING site without regenerating it. Claude returns
 * find/replace pairs; we apply each only if its `find` occurs exactly once, so every byte not
 * covered by a request stays identical. This is what a revision uses — the page keeps its
 * design, copy, and scripts; only the pinned elements change. Falls back to the unchanged HTML
 * (never a full regeneration) if the model is unavailable or returns nothing applicable.
 */
export async function editSiteHtml(
  currentHtml: string,
  changes: HtmlEditRequest[],
): Promise<{ html: string; engine: "claude-edit" | "noop"; applied: number; skipped: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || changes.length === 0) {
    return { html: currentHtml, engine: "noop", applied: 0, skipped: changes.length };
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
  const system = [
    "You are a precise HTML editor. You get the CURRENT HTML of a website and a numbered list of",
    "anchored change requests. Apply ONLY those changes and return them as find/replace edits.",
    "RULES:",
    "- `find` MUST be an EXACT substring copied verbatim from the CURRENT HTML (identical",
    "  whitespace, attributes, and classes), long enough to occur EXACTLY ONCE in the document.",
    "- `replace` is the new HTML for that snippet only. Change as little as possible: keep the same",
    "  element type, ids, data-* attributes, Tailwind classes, and surrounding structure unless the",
    "  request explicitly says otherwise.",
    "- Exactly one edit per request. Do NOT touch, reorder, reformat, or 'improve' anything else.",
    "- Never alter <script> blocks, form wiring, or the document structure beyond the request.",
    "- Output ONLY the JSON object — no markdown, no commentary.",
    `Required JSON shape:\n${EDIT_SHAPE}`,
  ].join("\n");

  const reqList = changes
    .map((c, i) => {
      const loc = [
        c.pagePath,
        c.selector ? `selector: ${c.selector}` : null,
        c.anchorText ? `near text: "${c.anchorText}"` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return `${i + 1}. [${loc}] ${c.instruction}`;
    })
    .join("\n");

  const res = await client.messages.create({
    model,
    max_tokens: 16000,
    thinking: { type: "disabled" },
    system,
    messages: [{ role: "user", content: `CURRENT HTML:\n\n${currentHtml}\n\n---\nCHANGE REQUESTS:\n${reqList}` }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const jsonText = (text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text).trim();

  let parsed: { edits?: Array<{ find?: unknown; replace?: unknown }> };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    console.error("[ai] surgical edit: model did not return valid JSON; leaving HTML unchanged");
    return { html: currentHtml, engine: "noop", applied: 0, skipped: changes.length };
  }

  let html = currentHtml;
  let applied = 0;
  let skipped = 0;
  for (const e of parsed.edits ?? []) {
    if (typeof e.find !== "string" || typeof e.replace !== "string" || e.find.length === 0) {
      skipped++;
      continue;
    }
    const first = html.indexOf(e.find);
    // Apply only when the anchor is unambiguous (occurs exactly once) — otherwise skip to
    // guarantee we never change an unintended part of the page.
    if (first === -1 || first !== html.lastIndexOf(e.find)) {
      skipped++;
      continue;
    }
    html = html.slice(0, first) + e.replace + html.slice(first + e.find.length);
    applied++;
  }

  if (applied === 0) return { html: currentHtml, engine: "noop", applied: 0, skipped };
  // The edit may have introduced new Tailwind classes → refresh the precompiled stylesheet.
  return { html: await recompileTailwind(html), engine: "claude-edit", applied, skipped };
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
  const parts = [
    UI_UX_DIRECTION,
    "",
    integrationContract(limits),
    "",
    HTML_RULES,
    "",
    leadCaptureDirective(intake, limits),
  ];
  if (refs.length) {
    parts.push(
      "",
      "REFERENCE COMPONENTS (from 21st.dev Magic). Adapt their structure and visual quality into your self-contained HTML: convert any React/shadcn/lucide into semantic HTML + Tailwind (inline SVG where needed). Do NOT import React/shadcn/lucide and do NOT leave JSX in the output.",
      ...refs.map((r) => `/* ${r.query} — ${r.componentName} */\n${r.code}`),
    );
  }
  // Brand inputs the client supplied take priority over generated/stock defaults.
  if (intake.logoUrl) {
    parts.push(
      "",
      `BRAND LOGO — use this exact image in the header (and the footer if fitting): ${intake.logoUrl}`,
      `Render it polished, never a raw stretched <img>: cap the height (~36–44px in the header, h-9/h-10/h-11), width auto, object-contain so it is never distorted, and ALWAYS soften the corners — wrap it in a rounded container (rounded-xl, or rounded-full for a circular/badge mark) with overflow-hidden. If the logo is a tight square/badge or could clash with the header background, give it a small white/neutral padded chip (e.g. bg-white p-1.5 rounded-xl ring-1 ring-black/5 shadow-sm) so it sits cleanly. Place it next to the business name (or use it alone if it's a full wordmark), inside the home link, with descriptive alt text.`,
    );
  }
  if (intake.colorPalette) {
    parts.push("", `BRAND PALETTE — base the entire color scheme on the client's chosen palette: ${intake.colorPalette}. Use it for backgrounds, accents, buttons, and links; ensure accessible contrast.`);
  }
  if (intake.pages?.length) {
    parts.push(
      "",
      `PAGES / SECTIONS — the client asked for these content units (max ${limits.maxPages}): ${intake.pages.join(", ")}. Cover each one. Decide per the CHOOSE THE LAYOUT rules whether each becomes its own routed page (data-page) or an on-page section (<section id>) — or a mix. "Home" is the top/hero. Don't pad thin content into separate pages just to fill the count.`,
    );
  }
  const gallery = intake.galleryImageUrls ?? [];
  const customImages = (intake.imageUrls ?? []).map((url) => ({ query: "client photo", url, alt: "business photo" }));
  const allImages = [...customImages, ...images];
  if (allImages.length) {
    parts.push(
      "",
      `IMAGES (use the client's own photos first, then these — real URLs, with descriptive alt + loading="lazy"):`,
      ...allImages.map((im) => `${im.url}  (alt: ${im.alt})`),
    );
  }
  if (gallery.length) {
    parts.push(
      "",
      `GALLERY PHOTOS — the owner chose these specific images for the Gallery section/page. Build a real, polished gallery from EXACTLY these (a responsive masonry or grid of rounded cards with subtle hover-zoom; optional lightbox on click). Use every one, each with descriptive alt + loading="lazy"; do not substitute stock photos for them:`,
      ...gallery.map((url) => url),
    );
  }
  if (intake.customInstructions) {
    parts.push(
      "",
      `CUSTOM INSTRUCTIONS from the business owner — follow these as long as they don't conflict with the rules above: ${intake.customInstructions}`,
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

function stubHtml(intake: WebsiteIntake, limits: PlanLimits): string {
  const services = (intake.services ?? [])
    .map((s) => `<li class="rounded-lg bg-stone-50 px-4 py-3">${escapeHtml(s)}</li>`)
    .join("");
  const tagline = `${escapeHtml(intake.businessType ?? "Quality service you can count on")}`;
  const areas = intake.serviceAreas?.length ? `Serving ${escapeHtml(intake.serviceAreas.join(", "))}` : "";
  const about = escapeHtml(intake.about ?? `${intake.businessName} is a local ${intake.businessType ?? "business"} dedicated to friendly, dependable service.`);

  // Launch (no forms): the contact section shows click-to-call / email only. Form-enabled
  // plans get the lead form wired to /api/v1/public/leads.
  const email = intake.email ? escapeHtml(intake.email) : null;
  const phone = intake.phone ? escapeHtml(intake.phone) : null;
  const contactDetails = `
      <div data-reveal class="mt-8 grid gap-4">
        ${phone ? `<a href="tel:${phone.replace(/[^+\d]/g, "")}" class="flex items-center gap-3 rounded-xl border border-stone-200 px-5 py-4 hover:border-amber-300 hover:bg-amber-50"><span class="text-stone-500">Call</span><span class="font-semibold text-stone-900">${phone}</span></a>` : ""}
        ${email ? `<a href="mailto:${email}" class="flex items-center gap-3 rounded-xl border border-stone-200 px-5 py-4 hover:border-amber-300 hover:bg-amber-50"><span class="text-stone-500">Email</span><span class="font-semibold text-stone-900">${email}</span></a>` : ""}
        ${!phone && !email ? `<p class="text-stone-600">Reach out and we'll be glad to help.</p>` : ""}
        ${areas ? `<p class="text-sm text-stone-500">${areas}.</p>` : ""}
      </div>`;
  const contactForm = `
      <form id="lead-form" data-reveal class="mt-8 grid gap-3" aria-live="polite">
        <label class="grid gap-1 text-sm font-medium">Your name<input name="name" required class="rounded-xl border border-stone-300 px-4 py-3 font-normal"/></label>
        <label class="grid gap-1 text-sm font-medium">Email<input name="email" type="email" required class="rounded-xl border border-stone-300 px-4 py-3 font-normal"/></label>
        <label class="grid gap-1 text-sm font-medium">Phone (optional)<input name="phone" class="rounded-xl border border-stone-300 px-4 py-3 font-normal"/></label>
        <label class="grid gap-1 text-sm font-medium">How can we help?<textarea name="message" rows="4" class="rounded-xl border border-stone-300 px-4 py-3 font-normal"></textarea></label>
        <button type="submit" class="rounded-full bg-amber-500 px-6 py-3.5 font-semibold text-white hover:bg-amber-600">Send message</button>
        <p id="lead-status" class="text-sm text-center text-stone-600"></p>
      </form>`;
  const logoMark = intake.logoUrl
    ? `<span class="inline-flex items-center justify-center bg-white p-1 rounded-xl ring-1 ring-black/5 shadow-sm overflow-hidden shrink-0"><img src="${escapeHtml(intake.logoUrl)}" alt="${escapeHtml(intake.businessName)} logo" class="h-9 w-auto object-contain"/></span>`
    : "";
  const nav = (extra = "") =>
    `<a href="/" class="px-3 py-2 rounded-lg hover:bg-stone-100 [&.is-active]:text-amber-600 [&.is-active]:font-semibold ${extra}">Home</a>
     <a href="/services" class="px-3 py-2 rounded-lg hover:bg-stone-100 [&.is-active]:text-amber-600 [&.is-active]:font-semibold ${extra}">Services</a>
     <a href="/about" class="px-3 py-2 rounded-lg hover:bg-stone-100 [&.is-active]:text-amber-600 [&.is-active]:font-semibold ${extra}">About</a>
     <a href="/contact" class="px-3 py-2 rounded-lg hover:bg-stone-100 [&.is-active]:text-amber-600 [&.is-active]:font-semibold ${extra}">Contact</a>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(intake.businessName)}</title>
<meta name="description" content="${tagline}${areas ? " · " + areas : ""}"/>
<link rel="canonical" href="__SITE_URL__/"/>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Hanken+Grotesk:wght@400;500;600&display=swap" rel="stylesheet"/>
<style>:root{font-family:'Hanken Grotesk',ui-sans-serif,system-ui,sans-serif}h1,h2,h3,.font-display{font-family:'Space Grotesk',ui-sans-serif,system-ui,sans-serif;letter-spacing:-0.02em}body{background:#faf9f7}</style>
</head>
<body class="bg-[#faf9f7] text-stone-900 antialiased">
<header class="sticky top-0 z-40 border-b border-stone-200/80 bg-white/85 backdrop-blur">
  <div class="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between gap-4">
    <a href="/" class="flex items-center gap-2.5 font-display font-bold text-lg tracking-tight">${logoMark}<span>${escapeHtml(intake.businessName)}</span></a>
    <nav class="hidden sm:flex items-center gap-1 text-sm">${nav()}</nav>
    <div class="hidden sm:block"><a href="/contact" class="rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-600">Get in touch</a></div>
    <button class="sm:hidden inline-flex items-center justify-center w-11 h-11 rounded-lg border border-stone-300" aria-controls="mobile-menu" aria-expanded="false" aria-label="Menu" onclick="var p=document.getElementById('mobile-menu');var o=this.getAttribute('aria-expanded')==='true';this.setAttribute('aria-expanded',String(!o));if(o){p.setAttribute('hidden','')}else{p.removeAttribute('hidden')}">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
    </button>
  </div>
  <nav id="mobile-menu" data-menu hidden class="sm:hidden border-t border-stone-200 bg-white px-4 py-3 grid gap-1 text-sm">${nav("block")}</nav>
</header>
<main>
  <div data-page="/" data-title="${escapeHtml(intake.businessName)} — Home">
    <section class="relative overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-br from-amber-50 via-white to-stone-50"></div>
      <div class="relative mx-auto max-w-6xl px-6 py-24 sm:py-28">
        <p data-reveal class="text-sm font-semibold uppercase tracking-widest text-amber-600">${areas || tagline}</p>
        <h1 data-reveal class="mt-4 font-display text-4xl sm:text-6xl font-bold tracking-tight max-w-3xl">${escapeHtml(intake.businessName)}</h1>
        <p data-reveal class="mt-5 text-lg text-stone-600 max-w-2xl">${tagline}.</p>
        <div data-reveal class="mt-9 flex flex-wrap gap-3">
          <a href="/contact" class="rounded-full bg-amber-500 px-7 py-3.5 font-semibold text-white hover:bg-amber-600">Get a free quote</a>
          <a href="/services" class="rounded-full border border-stone-300 px-7 py-3.5 font-semibold hover:bg-stone-50">Our services</a>
        </div>
      </div>
    </section>
    ${services ? `<section class="mx-auto max-w-6xl px-6 py-20"><h2 data-reveal class="font-display text-3xl font-bold">What we do</h2><ul class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${services}</ul></section>` : ""}
  </div>

  <div data-page="/services" data-title="Services — ${escapeHtml(intake.businessName)}">
    <section class="mx-auto max-w-6xl px-6 py-20">
      <h1 data-reveal class="font-display text-4xl font-bold tracking-tight">Our services</h1>
      <p data-reveal class="mt-4 text-lg text-stone-600 max-w-2xl">${tagline}.</p>
      ${services ? `<ul class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${services}</ul>` : `<p class="mt-10 text-stone-600">Get in touch to learn how we can help.</p>`}
      <div data-reveal class="mt-12"><a href="/contact" class="rounded-full bg-amber-500 px-7 py-3.5 font-semibold text-white hover:bg-amber-600">Request a quote</a></div>
    </section>
  </div>

  <div data-page="/about" data-title="About — ${escapeHtml(intake.businessName)}">
    <section class="mx-auto max-w-3xl px-6 py-20">
      <h1 data-reveal class="font-display text-4xl font-bold tracking-tight">About ${escapeHtml(intake.businessName)}</h1>
      <p data-reveal class="mt-6 text-lg leading-relaxed text-stone-700">${about}</p>
      ${areas ? `<p data-reveal class="mt-4 text-stone-600">${areas}.</p>` : ""}
    </section>
  </div>

  <div data-page="/contact" data-title="Contact — ${escapeHtml(intake.businessName)}">
    <section class="mx-auto max-w-xl px-6 py-20">
      <h1 data-reveal class="font-display text-4xl font-bold tracking-tight">Contact us</h1>
      <p data-reveal class="mt-4 text-stone-600">${limits.forms ? "Tell us what you need and we'll be in touch shortly." : "Get in touch — we'd love to hear from you."}</p>
      ${limits.forms ? contactForm : contactDetails}
    </section>
  </div>
</main>
<footer class="border-t border-stone-200 bg-stone-50">
  <div class="mx-auto max-w-6xl px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-stone-500">
    <span class="flex items-center gap-2.5 font-display font-semibold text-stone-700">${logoMark}<span>${escapeHtml(intake.businessName)}</span></span>
    <nav class="flex flex-wrap gap-1">${nav()}</nav>
    <span>Powered by PageBee</span>
  </div>
</footer>
${limits.forms ? `<script>
document.getElementById('lead-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  var f = e.target; var d = new FormData(f);
  var status = document.getElementById('lead-status');
  var btn = f.querySelector('button[type=submit]'); btn.disabled = true;
  status.textContent = 'Sending…';
  try {
    var res = await fetch('/api/v1/public/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ${SITE_TOKEN_PLACEHOLDER}' },
      body: JSON.stringify({ type: 'CONTACT_FORM', name: d.get('name'), email: d.get('email'), phone: d.get('phone') || undefined, message: d.get('message') || undefined, source: 'site' })
    });
    if (!res.ok) throw new Error(String(res.status));
    var data = await res.json().catch(function () { return {}; });
    btn.disabled = false;
    if (data && data.demo) { status.textContent = "Preview mode — this form isn't live yet, so your message was not sent."; }
    else { f.reset(); status.textContent = "Thanks — we'll be in touch."; }
  } catch (err) { btn.disabled = false; status.textContent = 'Something went wrong. Please try again.'; }
});
</script>` : ""}
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
