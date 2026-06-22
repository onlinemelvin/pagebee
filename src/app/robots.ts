import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// Only the public marketing surface should be crawlable. Authenticated app
// areas (client/admin dashboards), the API, and per-tenant preview/website
// routes are disallowed — they carry no SEO value and may leak tenant paths.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/client/",
        "/admin/",
        "/dashboard/",
        "/preview/",
        "/website-review/",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/invite/",
        "/unsubscribe/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
