import { SITE_TOKEN_PLACEHOLDER, SITE_URL_PLACEHOLDER } from "@/lib/ai/site-constants";
import type { ServeSite } from "@/lib/modules/website";

// Generated tenant sites are served as the REAL HTML document (not an iframe) so
// search engines get full content. Previews are served too, but in PREVIEW MODE:
// a banner + noindex, until the customer approves & launches.

const PAGE_CACHE = "public, s-maxage=60, stale-while-revalidate=86400";

function htmlResponse(body: string, status = 200, cache = PAGE_CACHE): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": cache },
  });
}

function originFromRequest(req: Request): string {
  const host = req.headers.get("host") ?? "";
  const proto = host.includes("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${proto}://${host}`;
}

function notFoundDoc(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="robots" content="noindex"/><title>Coming soon</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#fafaf9;color:#1c1917}</style></head><body><div style="text-align:center"><h1 style="font-size:1.5rem;font-weight:600">Coming soon</h1><p style="opacity:.6">This site isn't published yet.</p></div></body></html>`;
}

// Injected into <head>: noindex + room for the banner + the pulse animation.
const PREVIEW_HEAD = `<meta name="robots" content="noindex"/><style>body{padding-bottom:80px!important}@keyframes pbPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.75)}}</style>`;

// A loud, unmistakable "this is a preview" bar pinned to the bottom.
const PREVIEW_BANNER = `<div role="status" style="position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:linear-gradient(90deg,#f59e0b 0%,#fbbf24 100%);color:#1c1917;font:700 15px/1.45 ui-sans-serif,system-ui,-apple-system,sans-serif;padding:14px 18px;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px 14px;text-align:center;box-shadow:0 -6px 28px rgba(245,158,11,.5);border-top:3px solid #b45309"><span style="display:inline-flex;align-items:center;gap:8px"><span style="width:10px;height:10px;border-radius:50%;background:#dc2626;box-shadow:0 0 0 4px rgba(220,38,38,.25);animation:pbPulse 1.3s ease-in-out infinite"></span><strong style="background:#1c1917;color:#fbbf24;padding:3px 9px;border-radius:6px;font-size:12px;letter-spacing:.06em">🐝 FREE PREVIEW</strong></span><span>This site isn't live yet — approve it in your PageBee dashboard to launch.</span></div>`;

// Belt-and-suspenders: generated sites animate sections in with Motion by hiding them
// (opacity:0) until revealed. If the animation lib ever fails to load/run, content would
// stay invisible. This serve-time script runs OUR OWN IntersectionObserver to reveal any
// hidden [data-reveal] element on scroll, and hard-reveals anything still hidden after 4s.
const MOTION_FAILSAFE = `<script>(function(){try{var els=document.querySelectorAll('[data-reveal]');if(!els.length)return;var show=function(el){el.style.setProperty('opacity','1','important');el.style.setProperty('transform','none','important');el.style.transition='opacity .6s ease, transform .6s ease';};if(!('IntersectionObserver'in window)){els.forEach(show);return;}var io=new IntersectionObserver(function(en){en.forEach(function(e){if(e.isIntersecting){show(e.target);io.unobserve(e.target);}});},{threshold:0.1});els.forEach(function(el){io.observe(el);});setTimeout(function(){els.forEach(function(el){if(getComputedStyle(el).opacity==='0')show(el);});},4000);}catch(e){document.querySelectorAll('[data-reveal]').forEach(function(el){el.style.setProperty('opacity','1','important');});}})();</script>`;

function withMotionFailsafe(doc: string): string {
  return doc.includes("</body>") ? doc.replace("</body>", `${MOTION_FAILSAFE}</body>`) : doc + MOTION_FAILSAFE;
}

/** Inject noindex + a prominent preview banner into a generated document. */
function applyPreviewMode(doc: string): string {
  let out = doc;
  out = out.includes("</head>") ? out.replace("</head>", `${PREVIEW_HEAD}</head>`) : `${PREVIEW_HEAD}${out}`;
  out = out.includes("</body>") ? out.replace("</body>", `${PREVIEW_BANNER}</body>`) : out + PREVIEW_BANNER;
  return out;
}

/** Serve a renderable tenant site (published or preview), robots/sitemap, or a 404 doc. */
export function serveTenant(site: ServeSite | null, req: Request, path?: string[]): Response {
  const origin = originFromRequest(req);
  const seg = (path ?? []).join("/");

  if (!site) {
    return htmlResponse(notFoundDoc(), 404, "public, max-age=0, must-revalidate");
  }

  if (seg === "robots.txt") {
    const body =
      site.kind === "preview"
        ? "User-agent: *\nDisallow: /\n"
        : `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`;
    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": PAGE_CACHE },
    });
  }
  if (seg === "sitemap.xml") {
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url></urlset>`;
    return new Response(body, {
      status: 200,
      headers: { "content-type": "application/xml; charset=utf-8", "cache-control": PAGE_CACHE },
    });
  }

  let doc = site.html.replaceAll(SITE_TOKEN_PLACEHOLDER, site.siteToken).replaceAll(SITE_URL_PLACEHOLDER, origin);
  doc = withMotionFailsafe(doc);
  if (site.kind === "preview") {
    doc = applyPreviewMode(doc);
    return htmlResponse(doc, 200, "private, no-store"); // previews change as the client revises
  }
  return htmlResponse(doc);
}
