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

const PREVIEW_BANNER = `<div style="position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#1c1917;color:#fff;font:600 14px/1.4 ui-sans-serif,system-ui,sans-serif;padding:10px 16px;text-align:center;box-shadow:0 -2px 12px rgba(0,0,0,.2)">🐝 This is a free preview — not live yet. Approve it in your dashboard to launch.</div>`;

/** Inject noindex + a preview banner into a generated document. */
function applyPreviewMode(doc: string): string {
  let out = doc;
  if (out.includes("</head>")) {
    out = out.replace("</head>", `<meta name="robots" content="noindex"/></head>`);
  }
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
  if (site.kind === "preview") {
    doc = applyPreviewMode(doc);
    return htmlResponse(doc, 200, "private, no-store"); // previews change as the client revises
  }
  return htmlResponse(doc);
}
