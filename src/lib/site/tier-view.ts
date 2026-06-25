// Serve-time TIER VIEW — every site is generated at the top tier (all pages/sections/features), and
// the owner's selected/paid tier just hides what it doesn't include. No regeneration on a switch.
//
// Each top-level content unit is marked at generation with data-pb-section="<slug>" (and a
// data-pb-section-label). Multi-page units also carry data-page. This module hides the units beyond
// the tier's allowance: a CSS rule hides sections instantly (no flicker), and a small script (run
// BEFORE the client router) REMOVES hidden pages from the DOM + drops their nav links so the router
// never routes to them. Feature gating (forms/booking/etc.) is handled separately by the feed feeds.

import { planByName } from "@/lib/plans";

export interface SiteBlock {
  slug: string;
  label: string;
  isPage: boolean; // true → a [data-page] route; false → an in-page [data-pb-section]
}

/** Ordered list of the site's content blocks (slug + human label), parsed from the served HTML. */
export function listSiteBlocks(html: string): SiteBlock[] {
  const blocks: SiteBlock[] = [];
  const seen = new Set<string>();
  // Match each opening tag that carries data-pb-section, in document order.
  const re = /<(\w+)\b([^>]*\bdata-pb-section="([^"]+)"[^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = m[2];
    const slug = m[3];
    if (seen.has(slug)) continue;
    seen.add(slug);
    const labelMatch = /\bdata-pb-section-label="([^"]*)"/i.exec(attrs);
    const label = labelMatch?.[1] || slug.charAt(0).toUpperCase() + slug.slice(1);
    blocks.push({ slug, label, isPage: /\bdata-page="/i.test(attrs) });
  }
  return blocks;
}

/**
 * Resolve which block slugs are KEPT for a view tier. `keptSections` is the owner's explicit choice
 * (made when downgrading); when absent we keep the first `maxPages` blocks in document order. The
 * first block (hero/home) is always kept. Returns { kept, hidden } slug lists.
 */
export function resolveKeptBlocks(
  html: string,
  viewTier: string,
  keptSections?: string[] | null,
): { blocks: SiteBlock[]; kept: string[]; hidden: string[] } {
  const blocks = listSiteBlocks(html);
  const plan = planByName(viewTier);
  const maxPages = plan?.maxPages ?? blocks.length;
  const firstSlug = blocks[0]?.slug;

  let kept: string[];
  if (keptSections && keptSections.length) {
    kept = blocks.map((b) => b.slug).filter((s) => keptSections.includes(s));
    if (firstSlug && !kept.includes(firstSlug)) kept.unshift(firstSlug); // hero always kept
    kept = kept.slice(0, maxPages);
  } else {
    kept = blocks.slice(0, maxPages).map((b) => b.slug);
  }
  const keptSet = new Set(kept);
  const hidden = blocks.map((b) => b.slug).filter((s) => !keptSet.has(s));
  return { blocks, kept, hidden };
}

/**
 * Inject the tier view into a served document: a CSS rule that instantly hides the over-limit
 * sections, plus a script (before the router) that removes hidden PAGES + their nav links. No-op when
 * nothing is hidden.
 */
export function withTierView(doc: string, viewTier: string | undefined, keptSections?: string[] | null): string {
  if (!viewTier) return doc;
  const { hidden } = resolveKeptBlocks(doc, viewTier, keptSections);
  if (!hidden.length) return doc;

  const css =
    `<style>` +
    hidden.map((s) => `[data-pb-section="${cssEsc(s)}"]`).join(",") +
    `{display:none!important}</style>`;

  const script =
    "<script>(function(){try{var HID=" +
    JSON.stringify(hidden) +
    ";HID.forEach(function(slug){[].slice.call(document.querySelectorAll('[data-pb-section=\"'+slug+'\"]')).forEach(function(el){" +
    "var page=el.getAttribute('data-page');var id=el.id;" +
    // multi-page unit → drop its nav links and remove it from the DOM so the router skips it
    "if(page){[].forEach.call(document.querySelectorAll('nav a,header a,footer a'),function(a){var h=a.getAttribute('href')||'';if(h===page||h==='#'+page){var li=a.closest('li');(li||a).remove();}});if(el.parentNode)el.parentNode.removeChild(el);}" +
    // in-page section → hidden by CSS already; drop any in-page anchor link to it
    "else{if(id){[].forEach.call(document.querySelectorAll('nav a[href=\"#'+id+'\"]'),function(a){var li=a.closest('li');(li||a).remove();});}el.style.display='none';}" +
    "});});}catch(e){}})();</script>";

  let out = doc.includes("</head>") ? doc.replace("</head>", `${css}</head>`) : css + doc;
  out = out.includes("</body>") ? out.replace("</body>", `${script}</body>`) : out + script;
  return out;
}

function cssEsc(s: string): string {
  return s.replace(/["\\]/g, "\\$&");
}
