// Vercel implementation of the Registrar contract — a thin adapter over src/lib/vercel/registrar.ts
// (the actual Vercel Registrar API calls live there). Good for MVP scale; see docs/DOMAINS.md for
// when/why to move to a dedicated reseller registrar.

import { registrarConfigured, lookup, getPrice, buyDomain } from "@/lib/vercel/registrar";
import type { Registrar } from "./types";

export const vercelRegistrar: Registrar = {
  name: "vercel",
  configured: registrarConfigured,
  lookup,
  getPrice,
  async buyDomain(domain, opts) {
    const { orderId } = await buyDomain(domain, opts);
    return { orderId, provider: "vercel" };
  },
};
