// Precompile a generated site's Tailwind utilities into a minimal static stylesheet at
// GENERATION time (in the background worker), so the published/preview HTML ships real CSS
// instead of the render-blocking ~300KB Tailwind Play CDN runtime (cdn.tailwindcss.com),
// which JIT-compiles in the browser and is the main cause of slow/blank first paint.
//
// The compiled CSS is stored once in the WebsiteVersion.generatedHtml and served statically
// thereafter — compile once, serve forever. On ANY failure we keep the CDN <script> intact,
// so we never ship a broken/unstyled site (graceful degradation, never worse than today).
//
// The native deps (@tailwindcss/oxide, lightningcss via @tailwindcss/node) are imported
// dynamically so they load ONLY in the worker that actually generates sites, and are never
// statically traced into serverless/edge route bundles.

import { createRequire } from "node:module";
import path from "node:path";

// Resolve the native deps with a CommonJS require rooted at the project (NOT import.meta.url):
// it works identically under tsx (the worker), plain Node, and the Next server, and because the
// require call lives inside compileTailwindCss(), bundlers never trace these native packages into
// route bundles — they load only when a site is actually generated.
const requireFromRoot = createRequire(path.join(process.cwd(), "package.json"));

const TAILWIND_INPUT = '@import "tailwindcss";';

// Matches the Play CDN <script> however the model wrote it (extra attrs / query string).
const CDN_SCRIPT_RE =
  /<script\b[^>]*\bsrc=["']https:\/\/cdn\.tailwindcss\.com[^"']*["'][^>]*>\s*<\/script>/i;
// Inline `tailwind.config = {...}` only works WITH the runtime CDN; once we remove the CDN it
// would throw "tailwind is not defined". Strip any such config script defensively.
const CONFIG_SCRIPT_RE = /<script\b[^>]*>[\s\S]*?tailwind\.config[\s\S]*?<\/script>/gi;

/**
 * Compile the exact set of Tailwind classes used in `html` into a minimal, minified
 * stylesheet (includes Preflight + only the utilities/theme vars actually used).
 * Returns null on any failure or implausibly small output (caller keeps the CDN).
 */
export async function compileTailwindCss(html: string): Promise<string | null> {
  try {
    const { Scanner } = requireFromRoot("@tailwindcss/oxide") as typeof import("@tailwindcss/oxide");
    const { compile, optimize } = requireFromRoot("@tailwindcss/node") as typeof import("@tailwindcss/node");

    // Extract candidate class names straight from the generated HTML (handles arbitrary
    // values like bg-[#faf9f7] and variants like [&.is-active]:text-amber-600).
    const scanner = new Scanner({});
    const candidates = scanner.scanFiles([{ content: html, extension: "html" }]);
    if (candidates.length === 0) return null;

    const compiler = await compile(TAILWIND_INPUT, {
      base: process.cwd(),
      onDependency: () => {},
    });
    const css = compiler.build(candidates);
    if (!css || css.length < 256) return null; // implausibly small → treat as a failure

    const { code } = optimize(css, { minify: true });
    return code && code.length > 0 ? code : css;
  } catch (err) {
    console.error("[tailwind] inline compile failed; keeping CDN fallback:", err);
    return null;
  }
}

/**
 * Replace the runtime Tailwind Play CDN in a generated document with a precompiled
 * <style> for this exact site. No-op (original HTML, CDN intact) when there is no CDN
 * to replace or compilation isn't possible.
 */
export async function inlineTailwind(html: string): Promise<string> {
  if (!html.includes("cdn.tailwindcss.com")) return html;
  const css = await compileTailwindCss(html);
  if (!css) return html;

  const styleTag = `<style id="pagebee-tw">${css}</style>`;
  // Replace the first CDN script with the compiled stylesheet (preserving its position so
  // Tailwind still precedes any author <style> font overrides), then drop any duplicates
  // and strip inline tailwind.config scripts that would now throw.
  let out = html.replace(CDN_SCRIPT_RE, () => styleTag);
  out = out.replace(new RegExp(CDN_SCRIPT_RE.source, "gi"), "");
  out = out.replace(CONFIG_SCRIPT_RE, "");
  return out;
}

// The precompiled stylesheet inlineTailwind() injects (so we can refresh it after edits).
const INLINED_STYLE_RE = /<style id="pagebee-tw">[\s\S]*?<\/style>/i;

/**
 * Refresh the precompiled Tailwind <style> after a document was edited — a surgical edit may
 * introduce classes the original stylesheet didn't include. Recompiles from the edited HTML and
 * swaps the existing `pagebee-tw` block. If the doc still ships the CDN, defers to
 * inlineTailwind(); if there's nothing precompiled to refresh, returns the HTML untouched. On
 * any compile failure it keeps the existing styles (never ships an unstyled page).
 */
export async function recompileTailwind(html: string): Promise<string> {
  if (html.includes("cdn.tailwindcss.com")) return inlineTailwind(html);
  if (!INLINED_STYLE_RE.test(html)) return html;
  const css = await compileTailwindCss(html);
  if (!css) return html;
  return html.replace(INLINED_STYLE_RE, `<style id="pagebee-tw">${css}</style>`);
}
