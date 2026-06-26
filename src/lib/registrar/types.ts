// Provider-agnostic domain REGISTRAR contract. PageBee buys client domains through a registrar; this
// interface lets us swap the provider (Vercel today → Cloudflare/OpenSRS/Namecheap-reseller at scale)
// behind one adapter, without touching the purchase flow. See docs/DOMAINS.md for the why + triggers.
//
// NOTE: this covers REGISTRATION only (search / price / buy / registrant contact). Attaching a domain
// to the hosting project is separate (src/lib/vercel/domains.ts) and stays Vercel — the host doesn't
// change when the registrar does.

import type { DomainPrice, RegistrantContact } from "@/lib/vercel/registrar";

// Shared value/types re-exported so callers depend on the abstraction, not the Vercel module.
export type { DomainPrice, RegistrantContact };
export { RegistrarError, platformRegistrant } from "@/lib/vercel/registrar";

export interface BuyOptions {
  /** Guards against a price change between quote and purchase (cents). */
  expectedPriceCents: number;
  years?: number;
  autoRenew?: boolean;
  contact?: RegistrantContact;
}

export interface DomainOrder {
  orderId: string;
  /** Which adapter fulfilled the order — handy for audit + multi-registrar bookkeeping. */
  provider: string;
}

/** The contract every registrar adapter implements. Add a new provider by implementing this. */
export interface Registrar {
  readonly name: string;
  /** Whether this provider's credentials are present. */
  configured(): boolean;
  /** Availability + price in one shot (price only when available). */
  lookup(domain: string): Promise<{ available: boolean; price: DomainPrice | null }>;
  /** Registration price for a domain. */
  getPrice(domain: string, years?: number): Promise<DomainPrice>;
  /** Register the domain under the platform (or supplied) registrant contact. */
  buyDomain(domain: string, opts: BuyOptions): Promise<DomainOrder>;
}
