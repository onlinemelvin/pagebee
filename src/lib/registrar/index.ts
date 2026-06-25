// Registrar factory — pick the active provider from REGISTRAR_PROVIDER (default "vercel").
//
// To migrate to a reseller registrar at scale (see docs/DOMAINS.md), the change is ONE adapter:
//   1. Add src/lib/registrar/cloudflare.ts exporting `cloudflareRegistrar: Registrar`.
//   2. Add a `case "cloudflare": return cloudflareRegistrar;` below.
//   3. Set REGISTRAR_PROVIDER=cloudflare. Nothing in the purchase flow changes.

import { vercelRegistrar } from "./vercel";
import type { Registrar } from "./types";

export * from "./types";

export function getRegistrar(): Registrar {
  const provider = (process.env.REGISTRAR_PROVIDER ?? "vercel").toLowerCase();
  switch (provider) {
    case "vercel":
      return vercelRegistrar;
    // case "cloudflare": return cloudflareRegistrar;   // implement src/lib/registrar/cloudflare.ts
    // case "opensrs":    return openSrsRegistrar;       // implement src/lib/registrar/opensrs.ts
    default:
      return vercelRegistrar;
  }
}
