// Canonical plan definitions — single source of truth for the pricing page, the
// billing dashboard, and the DB seed. Mirrors docs/FEATURE_FLAGS.md. Fees in integer cents.

export type PlanName = "LAUNCH" | "CONNECT" | "AUTOMATE";

/** A displayable limit row for the billing "what you get" sneak-peek. */
export interface PlanQuotas {
  pages: number;
  updates: number; // monthly minor-update allowance (soft cap when unlimited)
  updatesUnlimited?: boolean;
  seats: number; // included team members
  seatsUnlimited?: boolean;
  sms?: number; // SMS alerts included / month (omitted = not included)
  aiReplies?: number; // AI assistant replies / month
  email?: number; // transactional emails / month
  invoices?: number; // invoices / month (soft cap when unlimited)
  invoicesUnlimited?: boolean;
}

export interface PlanDef {
  name: PlanName;
  label: string;
  tagline: string;
  setupFee: number; // cents
  monthlyFee: number; // cents
  maxPages: number; // max content units = pages OR on-page sections (the generator chooses the layout)
  monthlyUpdates: number; // enforced allowance (soft cap when quotas.updatesUnlimited)
  teamSeats: number; // included team members (multi-user)
  quotas: PlanQuotas;
  recommended?: boolean;
  highlights: string[];
  featureFlags: Record<string, unknown>;
}

export const PLANS: PlanDef[] = [
  {
    name: "LAUNCH",
    label: "Launch",
    tagline: "A clean, professional website — built, hosted, and maintained for you.",
    setupFee: 39900,
    monthlyFee: 3900,
    maxPages: 3,
    monthlyUpdates: 2,
    teamSeats: 1,
    quotas: { pages: 3, updates: 2, seats: 1, email: 250 },
    highlights: [
      "Up to 3 pages or sections, mobile-friendly",
      "Hosting, SSL & uptime monitoring",
      "Click-to-call & email contact details",
      "Basic SEO & analytics",
      "2 minor updates / month",
    ],
    featureFlags: {
      planName: "Launch",
      setupFee: 399,
      monthlyFee: 39,
      maxPages: 3,
      monthlyUpdates: 2,
      teamSeats: 1,
      emailIncludedMonthly: 250,
      // Launch is a brochure site: NO lead-capture forms. The contact section shows
      // click-to-call / email only. Lead forms (and the inbox) are a Connect+ value prop.
      contactForm: false,
      basicAnalytics: true,
      hosting: true,
      ssl: true,
      customDomain: false,
      booking: false,
      chat: false,
      smsAlerts: false,
      payments: false,
      invoices: false,
      statements: false,
      paymentReminders: false,
      aiAssistant: false,
      aiFollowUps: false,
    },
  },
  {
    name: "CONNECT",
    label: "Connect",
    tagline: "Capture leads, book customers, and manage inquiries from your site.",
    setupFee: 69900,
    monthlyFee: 8900,
    maxPages: 6,
    monthlyUpdates: 5,
    teamSeats: 3,
    quotas: { pages: 6, updates: 5, seats: 3, sms: 100, email: 1000 },
    recommended: true,
    highlights: [
      "Everything in Launch, plus:",
      "Appointment booking & scheduling",
      "Website chat + lead inbox",
      "SMS lead alerts (100/mo included)",
      "Custom domain · up to 6 pages or sections",
      "3 team members · 5 minor updates / month",
    ],
    featureFlags: {
      planName: "Connect",
      setupFee: 699,
      monthlyFee: 89,
      maxPages: 6,
      monthlyUpdates: 5,
      teamSeats: 3,
      contactForm: true,
      basicAnalytics: true,
      hosting: true,
      ssl: true,
      customDomain: true,
      booking: true,
      chat: true,
      smsAlerts: false, // disabled until a real SMS provider is wired — sendSms() is a metered stub that would bill for unsent messages
      smsIncludedMonthly: 100,
      emailIncludedMonthly: 1000,
      payments: false,
      invoices: false,
      statements: false,
      paymentReminders: false,
      aiAssistant: false,
      aiFollowUps: false,
    },
  },
  {
    name: "AUTOMATE",
    label: "Automate",
    tagline: "Let your site respond, book, collect payments, and follow up — automatically.",
    setupFee: 99900,
    monthlyFee: 17900,
    maxPages: 12,
    monthlyUpdates: 30, // "Unlimited (fair use)" — high soft cap that normal use never reaches
    teamSeats: 5,
    quotas: {
      pages: 12,
      updates: 30,
      updatesUnlimited: true,
      seats: 5,
      seatsUnlimited: true,
      sms: 500,
      aiReplies: 1000,
      email: 5000,
      invoices: 1000,
      invoicesUnlimited: true,
    },
    highlights: [
      "Everything in Connect, plus:",
      "Payments, invoices & receipts — unlimited",
      "AI assistant — 1,000 replies / mo, follow-ups & lead scoring",
      "Customer payment portal & statements",
      "SMS lead alerts (500/mo included)",
      "Unlimited team members · unlimited updates",
    ],
    featureFlags: {
      planName: "Automate",
      setupFee: 999,
      monthlyFee: 179,
      maxPages: 12,
      monthlyUpdates: 30,
      teamSeats: 5,
      unlimitedSeats: true,
      contactForm: true,
      basicAnalytics: true,
      hosting: true,
      ssl: true,
      customDomain: true,
      booking: true,
      chat: true,
      smsAlerts: false, // disabled until a real SMS provider is wired — sendSms() is a metered stub that would bill for unsent messages
      smsIncludedMonthly: 500,
      emailIncludedMonthly: 5000,
      payments: true,
      invoices: true,
      statements: true,
      paymentLinks: true,
      paidBookings: true,
      paymentReminders: true,
      customerPaymentPortal: true,
      aiAssistant: true,
      aiFollowUps: true,
      aiLeadScoring: true,
      aiSummaries: true,
      aiInvoiceFollowUps: true,
      aiRepliesIncludedMonthly: 1000,
      invoicesIncludedMonthly: 1000,
      unlimitedInvoices: true,
      unlimitedUpdates: true,
    },
  },
];

export const PRICING_NOTE =
  "Payment processing fees are charged separately by Stripe. SMS and AI usage include generous monthly limits; sustained heavy usage may be billed separately. “Unlimited” means fair-use.";

// PLANS is ordered ascending (Launch < Connect < Automate) — used for tier comparisons.
const PLAN_ORDER: PlanName[] = ["LAUNCH", "CONNECT", "AUTOMATE"];

/** Look up a plan definition by its canonical name. */
export function planByName(name: string): PlanDef | undefined {
  return PLANS.find((p) => p.name === name);
}

/** The next higher tier above `name`, or null if already on the top tier. */
export function nextTier(name: string): PlanDef | null {
  const i = PLAN_ORDER.indexOf(name as PlanName);
  if (i < 0 || i >= PLAN_ORDER.length - 1) return null;
  return planByName(PLAN_ORDER[i + 1]) ?? null;
}

/** Index of a plan in the ascending tier order (-1 if unknown). */
export function planRank(name: string): number {
  return PLAN_ORDER.indexOf(name as PlanName);
}

/** The cheapest plan whose feature flags enable `flag` (e.g. "booking" → Connect). */
export function planForFlag(flag: string): PlanDef | undefined {
  return PLANS.find((p) => p.featureFlags[flag] === true);
}

/** Structured limit rows for the billing "what's included" sneak-peek. */
export function planLimitRows(plan: PlanDef): { label: string; value: string }[] {
  const q = plan.quotas;
  const rows: { label: string; value: string }[] = [
    { label: "Pages & sections", value: `Up to ${q.pages}` },
    { label: "Website updates", value: q.updatesUnlimited ? "Unlimited" : `${q.updates} / mo` },
    { label: "Team members", value: q.seatsUnlimited ? "Unlimited" : `${q.seats}` },
  ];
  if (q.sms) rows.push({ label: "SMS lead alerts", value: `${q.sms.toLocaleString()} / mo` });
  if (q.aiReplies) rows.push({ label: "AI assistant replies", value: `${q.aiReplies.toLocaleString()} / mo` });
  if (q.email) rows.push({ label: "Emails", value: `${q.email.toLocaleString()} / mo` });
  if (q.invoices !== undefined) rows.push({ label: "Invoices", value: q.invoicesUnlimited ? "Unlimited" : `${q.invoices} / mo` });
  return rows;
}
