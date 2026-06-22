import type { MetadataRoute } from "next";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// Auto-discovered from the public route group. Anything with a `page.tsx`
// under src/app/(public) becomes an indexable URL — add a public marketing
// page and it shows up here with no edits. Authenticated/app/API routes live
// outside this group and are excluded by construction (and in robots.ts).
const PUBLIC_ROOT = join(process.cwd(), "src", "app", "(public)");

type Route = { path: string; lastModified: Date };

async function discover(dir: string, segments: string[]): Promise<Route[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return []; // directory missing — nothing to emit
  }

  const routes: Route[] = [];
  for (const entry of entries) {
    const name = entry.name;

    if (entry.isDirectory()) {
      // Skip dynamic segments ([slug]) — can't enumerate without data — and
      // private folders (_foo). Route groups ((grp)) don't add a URL segment.
      if (name.startsWith("[") || name.startsWith("_")) continue;
      const isGroup = name.startsWith("(") && name.endsWith(")");
      routes.push(
        ...(await discover(join(dir, name), isGroup ? segments : [...segments, name])),
      );
    } else if (/^page\.(tsx|ts|jsx|js|mdx)$/.test(name)) {
      const { mtime } = await stat(join(dir, name));
      routes.push({ path: "/" + segments.join("/"), lastModified: mtime });
    }
  }
  return routes;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes = await discover(PUBLIC_ROOT, []);

  return routes
    .sort((a, b) => a.path.length - b.path.length) // home first, then deeper
    .map(({ path, lastModified }) => ({
      url: `${SITE_URL}${path === "/" ? "" : path}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: path === "/" ? 1 : 0.8,
    }));
}
