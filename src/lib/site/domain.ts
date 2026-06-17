// Custom-domain helpers: normalize raw owner input, validate it, and derive the DNS records
// the owner must set. Shared by the client request route, the admin approval flow, and the
// Vercel provisioning layer. Pure functions — no I/O — so they're trivially testable.

/** A DNS record we instruct the owner to create at their registrar. */
export interface DnsRecord {
  type: "A" | "CNAME";
  name: string; // "@" for apex, or the subdomain label (e.g. "www")
  value: string;
}

/** The DNS guidance surfaced to the owner + stored on WebsiteDomain.verification. */
export interface DomainVerification {
  records: DnsRecord[];
  // Vercel-issued domain-ownership TXT challenges (only present when Vercel requires them,
  // e.g. the apex is already attached to another Vercel account). Owner must add these too.
  txt?: { domain: string; type: string; value: string }[];
}

// Vercel's published anycast target for apex A-records and the CNAME for everything else.
// See vercel.com/docs/projects/domains. These are stable platform values.
const VERCEL_A_RECORD = "76.76.21.21";
const VERCEL_CNAME = "cname.vercel-dns.com";

// Hostname label rules (RFC 1123): letters/digits/hyphens, no leading/trailing hyphen, ≤63 chars.
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/**
 * Normalize whatever the owner pasted into a bare, lowercase hostname: strip the scheme, any
 * path/query, a leading "www." is kept (it's a valid distinct host) but surrounding whitespace,
 * a trailing dot, and port are removed. Returns "" when nothing usable remains.
 */
export function normalizeDomain(input: string): string {
  let host = (input ?? "").trim().toLowerCase();
  if (!host) return "";
  host = host.replace(/^https?:\/\//, ""); // drop scheme
  host = host.replace(/\/.*$/, ""); // drop path/query/fragment
  host = host.replace(/:\d+$/, ""); // drop port
  host = host.replace(/\.$/, ""); // drop trailing dot (FQDN form)
  return host;
}

/** A syntactically valid public domain with at least two labels and a real-looking TLD. */
export function isValidDomain(host: string): boolean {
  if (!host || host.length > 253) return false;
  const labels = host.split(".");
  if (labels.length < 2) return false; // need at least name.tld
  if (!labels.every((l) => LABEL.test(l))) return false;
  const tld = labels[labels.length - 1];
  return /^[a-z]{2,}$/.test(tld); // alphabetic TLD, ≥2 chars
}

/** True when `host` is the platform root domain or any subdomain of it (can't be a custom domain). */
export function isPlatformDomain(host: string, rootDomain: string): boolean {
  const root = normalizeDomain(rootDomain).replace(/:\d+$/, "");
  if (!root) return false;
  return host === root || host.endsWith(`.${root}`);
}

/** Apex (no subdomain, e.g. "acme.com") vs a subdomain (e.g. "www.acme.com", "book.acme.com"). */
export function isApex(host: string): boolean {
  return host.split(".").length === 2;
}

/**
 * The DNS records to instruct the owner to create: an A-record at the apex, or a CNAME for a
 * subdomain. (Vercel may additionally require a TXT challenge; that's merged in from the API
 * response at approval time — see provisionDomain.)
 */
export function dnsRecordsFor(host: string): DnsRecord[] {
  if (isApex(host)) {
    return [{ type: "A", name: "@", value: VERCEL_A_RECORD }];
  }
  const label = host.split(".")[0];
  return [{ type: "CNAME", name: label, value: VERCEL_CNAME }];
}

export type HostKind = "apex" | "www" | "subdomain";

/** One host to provision for a connection, with its kind, canonical flag, and DNS records. */
export interface PlannedHost {
  host: string;
  kind: HostKind;
  isPrimary: boolean; // the canonical host; the sibling redirects here
  records: DnsRecord[];
}

/**
 * Expand a validated domain into the host(s) to provision:
 *   - apex "acme.com"        → [acme.com (primary), www.acme.com]   (www redirects to apex)
 *   - "www.acme.com"         → [www.acme.com (primary), acme.com]   (apex redirects to www)
 *   - other sub "book.acme…" → [book.acme.com (primary)]            (no sibling)
 * The host the owner typed is always the primary (canonical), so we honour their intent; the
 * sibling is set to redirect to it on Vercel at approval time.
 *
 * Apex detection uses the literal `www.` prefix and a 2-label heuristic — good for the common
 * `.com`/`.net`/`.org` case. Multi-part ccTLD apexes (e.g. `acme.co.uk`) aren't auto-paired with
 * their www and are treated as a single subdomain-style host (still connectable, just not paired).
 */
export function planHosts(domain: string): PlannedHost[] {
  const labels = domain.split(".");
  if (labels[0] === "www" && labels.length >= 3) {
    const apex = labels.slice(1).join(".");
    return [
      { host: domain, kind: "www", isPrimary: true, records: dnsRecordsFor(domain) },
      { host: apex, kind: "apex", isPrimary: false, records: dnsRecordsFor(apex) },
    ];
  }
  if (labels.length === 2) {
    const www = `www.${domain}`;
    return [
      { host: domain, kind: "apex", isPrimary: true, records: dnsRecordsFor(domain) },
      { host: www, kind: "www", isPrimary: false, records: dnsRecordsFor(www) },
    ];
  }
  return [{ host: domain, kind: "subdomain", isPrimary: true, records: dnsRecordsFor(domain) }];
}

export type DomainCheck =
  | { ok: true; domain: string }
  | { ok: false; reason: "empty" | "invalid" | "platform_domain" };

/**
 * One-shot validate + normalize for the request route: returns the clean host or a machine
 * reason. `rootDomain` is NEXT_PUBLIC_ROOT_DOMAIN so we reject *.pagebee.com (those are free
 * subdomains, not custom domains).
 */
export function checkCustomDomain(input: string, rootDomain: string): DomainCheck {
  const host = normalizeDomain(input);
  if (!host) return { ok: false, reason: "empty" };
  if (!isValidDomain(host)) return { ok: false, reason: "invalid" };
  if (isPlatformDomain(host, rootDomain)) return { ok: false, reason: "platform_domain" };
  return { ok: true, domain: host };
}
