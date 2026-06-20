// Vercel Domains Registrar API — search, price, and BUY domains (the "buy a brand new domain" path).
// Separate from vercel/domains.ts (which attaches domains a client already owns to the project).
// Docs: https://vercel.com/docs/domains/registrar-api  (v1/registrar/* — the legacy v4 was sunset).
//
// PageBee absorbs the domain cost: it registers under the PLATFORM's contact info (REGISTRANT_*),
// points the domain at the client's site, and gates spend with a price cap (admin reviews over-cap).

const API = "https://api.vercel.com";

function token() {
  return process.env.VERCEL_TOKEN ?? "";
}
function teamParam(): string {
  const t = process.env.VERCEL_TEAM_ID;
  return t ? `teamId=${encodeURIComponent(t)}` : "";
}
function qs(...parts: string[]): string {
  const p = parts.filter(Boolean);
  return p.length ? `?${p.join("&")}` : "";
}

/** Whether the registrar (search/buy) is wired. Same token as the rest of the Vercel integration. */
export function registrarConfigured(): boolean {
  return Boolean(token());
}

export class RegistrarError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "RegistrarError";
  }
}

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
}

async function parseError(res: Response): Promise<RegistrarError> {
  const data = (await res.json().catch(() => null)) as { code?: string; message?: string; error?: { code?: string; message?: string } } | null;
  const code = data?.code ?? data?.error?.code ?? "registrar_error";
  const message = data?.message ?? data?.error?.message ?? `Vercel registrar API ${res.status}`;
  return new RegistrarError(res.status, code, message);
}

/** Is this domain available to register? */
export async function checkAvailability(domain: string): Promise<boolean> {
  const res = await call("GET", `/v1/registrar/domains/${encodeURIComponent(domain)}/availability${qs(teamParam())}`);
  if (!res.ok) throw await parseError(res);
  const d = (await res.json()) as { available?: boolean };
  return Boolean(d.available);
}

export interface DomainPrice {
  /** Registration price for the period, in integer cents (PageBee stores money as cents). */
  priceCents: number;
  /** Years the price covers. */
  years: number;
}

/** Registration price for a domain (Vercel returns dollars; we convert to cents). */
export async function getPrice(domain: string, years = 1): Promise<DomainPrice> {
  const res = await call("GET", `/v1/registrar/domains/${encodeURIComponent(domain)}/price${qs(teamParam(), `years=${years}`)}`);
  if (!res.ok) throw await parseError(res);
  const d = (await res.json()) as { price?: number; period?: number };
  return { priceCents: Math.round((d.price ?? 0) * 100), years: d.period ?? years };
}

/** Availability + price in one shot (price only fetched when available). */
export async function lookup(domain: string): Promise<{ available: boolean; price: DomainPrice | null }> {
  const available = await checkAvailability(domain);
  if (!available) return { available: false, price: null };
  const price = await getPrice(domain).catch(() => null);
  return { available: true, price };
}

/** WHOIS/registrant contact required to register a domain. */
export interface RegistrantContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string; // E.164 with a dot, e.g. "+1.5551234567"
  address1: string;
  city: string;
  state: string;
  zip: string;
  country: string; // ISO 3166-1 alpha-2, e.g. "US"
  companyName?: string;
}

/**
 * The platform registrant from env (PageBee owns the registrations it buys). Throws if any required
 * field is missing — buying must fail closed rather than send an incomplete WHOIS record.
 */
export function platformRegistrant(): RegistrantContact {
  const g = (k: string) => (process.env[k] ?? "").trim();
  const c: RegistrantContact = {
    firstName: g("REGISTRANT_FIRST_NAME"),
    lastName: g("REGISTRANT_LAST_NAME"),
    email: g("REGISTRANT_EMAIL"),
    phone: g("REGISTRANT_PHONE"),
    address1: g("REGISTRANT_ADDRESS1"),
    city: g("REGISTRANT_CITY"),
    state: g("REGISTRANT_STATE"),
    zip: g("REGISTRANT_ZIP"),
    country: g("REGISTRANT_COUNTRY") || "US",
    companyName: g("REGISTRANT_COMPANY") || undefined,
  };
  const missing = (["firstName", "lastName", "email", "phone", "address1", "city", "state", "zip", "country"] as const).filter(
    (k) => !c[k],
  );
  if (missing.length) throw new RegistrarError(500, "registrant_incomplete", `Missing REGISTRANT_* env: ${missing.join(", ")}`);
  return c;
}

/**
 * Buy a domain. `expectedPriceCents` guards against a price change between quote and purchase
 * (Vercel rejects with `expected_price_mismatch` if it moved). Returns the order id. The caller
 * attaches the domain to the project afterwards (see modules/website/domain.ts).
 */
export async function buyDomain(
  domain: string,
  opts: { expectedPriceCents: number; years?: number; autoRenew?: boolean; contact?: RegistrantContact },
): Promise<{ orderId: string }> {
  const contact = opts.contact ?? platformRegistrant();
  const body = {
    autoRenew: opts.autoRenew ?? true,
    years: opts.years ?? 1,
    expectedPrice: opts.expectedPriceCents / 100, // dollars
    contactInformation: contact,
  };
  const res = await call("POST", `/v1/registrar/domains/${encodeURIComponent(domain)}/buy${qs(teamParam())}`, body);
  if (!res.ok) throw await parseError(res);
  const d = (await res.json()) as { orderId?: string };
  if (!d.orderId) throw new RegistrarError(502, "no_order_id", "Vercel did not return an order id");
  return { orderId: d.orderId };
}
