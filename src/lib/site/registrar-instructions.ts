// "I already have a domain" path: where-to-click DNS instructions per registrar, so the owner can
// add the A/CNAME records we give them. Known providers get hand-written steps; an unknown provider
// ("Other") falls back to AI-written steps (see aiConnectInstructions in modules/website/domain.ts).
// The steps are record-agnostic — the actual records to add are shown in their own table beside them.

export interface RegistrarGuide {
  key: string;
  name: string;
  /** Deep link to the provider's DNS management area, when stable. */
  dnsUrl?: string;
  /** Ordered, plain-language steps to reach the DNS records screen + add a record. */
  steps: string[];
}

const ADD_RECORD = "For each record in the table, click Add, choose the Type (A or CNAME), paste the Name/Host and Value exactly as shown, and save.";

// Most common registrars for small businesses. Steps describe how to reach the DNS editor; the
// generic ADD_RECORD line closes each one. Keep them short and non-brittle (UIs change).
const GUIDES: RegistrarGuide[] = [
  {
    key: "godaddy",
    name: "GoDaddy",
    dnsUrl: "https://dcc.godaddy.com/control/portfolio",
    steps: [
      "Sign in to GoDaddy and open your list of domains.",
      "Find your domain and click the three-dot menu → Edit DNS (or open the domain, then DNS).",
      "You'll see the DNS Records table.",
      ADD_RECORD,
      "If GoDaddy already has a parked A record with Name “@”, edit it to the value below instead of adding a duplicate.",
    ],
  },
  {
    key: "namecheap",
    name: "Namecheap",
    dnsUrl: "https://ap.www.namecheap.com/domains/list/",
    steps: [
      "Sign in to Namecheap → Domain List → Manage next to your domain.",
      "Open the Advanced DNS tab.",
      "Under Host Records, remove any default “parking” or URL-redirect record first.",
      ADD_RECORD,
      "For the apex A record, set Host to “@”. For www, set Host to “www”.",
    ],
  },
  {
    key: "cloudflare",
    name: "Cloudflare",
    dnsUrl: "https://dash.cloudflare.com",
    steps: [
      "Sign in to Cloudflare and select your domain, then open DNS → Records.",
      "Add the records from the table.",
      "IMPORTANT: set the Proxy status to “DNS only” (grey cloud, not orange) for these records — proxying them breaks the connection.",
      ADD_RECORD,
    ],
  },
  {
    key: "squarespace",
    name: "Squarespace / Google Domains",
    dnsUrl: "https://account.squarespace.com/domains",
    steps: [
      "Google Domains moved to Squarespace — sign in at account.squarespace.com.",
      "Open your domain → DNS → DNS Settings (Custom records).",
      ADD_RECORD,
    ],
  },
  {
    key: "wix",
    name: "Wix",
    dnsUrl: "https://www.wix.com/account/domains",
    steps: [
      "Sign in to Wix → Domains, and click your domain.",
      "Open Advanced → Edit DNS (or “Manage DNS records”).",
      ADD_RECORD,
    ],
  },
  {
    key: "bluehost",
    name: "Bluehost",
    dnsUrl: "https://my.bluehost.com",
    steps: [
      "Sign in to Bluehost → Domains, and select your domain.",
      "Open the DNS tab / Zone Editor.",
      ADD_RECORD,
    ],
  },
  {
    key: "hostinger",
    name: "Hostinger",
    dnsUrl: "https://hpanel.hostinger.com",
    steps: [
      "Sign in to Hostinger (hPanel) → Domains → your domain → DNS / Nameservers.",
      "Use the DNS Records section.",
      ADD_RECORD,
    ],
  },
  {
    key: "ionos",
    name: "IONOS",
    dnsUrl: "https://my.ionos.com",
    steps: [
      "Sign in to IONOS → Domains & SSL → click your domain → DNS.",
      ADD_RECORD,
    ],
  },
  {
    key: "porkbun",
    name: "Porkbun",
    dnsUrl: "https://porkbun.com/account/domainsSpeedy",
    steps: [
      "Sign in to Porkbun → Domain Management → click the DNS / Details icon for your domain.",
      ADD_RECORD,
    ],
  },
];

const BY_KEY = new Map(GUIDES.map((g) => [g.key, g]));

/** The registrars we have hand-written steps for (for the client's picker). */
export function knownRegistrars(): { key: string; name: string }[] {
  return GUIDES.map((g) => ({ key: g.key, name: g.name }));
}

/** A registrar's guide by key, or null when we don't have one (→ use AI-written steps). */
export function getRegistrarGuide(key: string | null | undefined): RegistrarGuide | null {
  if (!key) return null;
  return BY_KEY.get(key.toLowerCase().trim()) ?? null;
}

/** Normalize a free-typed registrar name to a known key, else null. */
export function normalizeRegistrar(input: string): string | null {
  const s = input.toLowerCase().replace(/\.(com|net|org|io)$/i, "").trim();
  for (const g of GUIDES) {
    if (s.includes(g.key) || g.name.toLowerCase().includes(s)) return g.key;
  }
  return null;
}
