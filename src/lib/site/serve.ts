import { SITE_TOKEN_PLACEHOLDER, SITE_URL_PLACEHOLDER } from "@/lib/ai/site-constants";
import type { PublishedSite } from "@/lib/modules/website";

// Generated tenant sites are served as the REAL HTML document (not an iframe) so
// search engines get full content + proper head/meta. Tokens/URLs are injected per host.

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

/** Serve a published tenant site (or robots/sitemap, or a 404 doc). */
export function serveTenant(site: PublishedSite | null, req: Request, path?: string[]): Response {
  const origin = originFromRequest(req);
  const seg = (path ?? []).join("/");

  if (!site || !site.publishedVersion?.generatedHtml) {
    return htmlResponse(notFoundDoc(), 404, "public, max-age=0, must-revalidate");
  }

  if (seg === "robots.txt") {
    return new Response(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`, {
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

  const doc = site.publishedVersion.generatedHtml
    .replaceAll(SITE_TOKEN_PLACEHOLDER, site.siteToken)
    .replaceAll(SITE_URL_PLACEHOLDER, origin);
  return htmlResponse(doc);
}
