// Canonical plan definitions — single source of truth for the pricing page and
// the DB seed. Mirrors docs/FEATURE_FLAGS.md. Fees are in integer cents.

export type PlanName = "LAUNCH" | "CONNECT" | "AUTOMATE";

export interface PlanDef {
  name: PlanName;
  label: string;
  tagline: string;
  setupFee: number; // cents
  monthlyFee: number; // cents
  maxPages: number; // max content units = pages OR on-page sections (the generator chooses the layout)
  monthlyUpdates: number;
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
    monthlyUpdates: 1,
    highlights: [
      "Up to 3 pages or sections, mobile-friendly",
      "Hosting, SSL & uptime monitoring",
      "Click-to-call & email contact details",
      "Basic SEO & analytics",
      "1 minor update / month",
    ],
    featureFlags: {
      planName: "Launch",
      setupFee: 399,
      monthlyFee: 39,
      maxPages: 3,
      monthlyUpdates: 1,
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
    monthlyUpdates: 3,
    recommended: true,
    highlights: [
      "Everything in Launch, plus:",
      "Appointment booking & scheduling",
      "Website chat + lead inbox",
      "SMS lead alerts (50/mo included)",
      "Custom domain · up to 6 pages or sections",
      "3 minor updates / month",
    ],
    featureFlags: {
      planName: "Connect",
      setupFee: 699,
      monthlyFee: 89,
      maxPages: 6,
      monthlyUpdates: 3,
      contactForm: true,
      basicAnalytics: true,
      hosting: true,
      ssl: true,
      customDomain: true,
      booking: true,
      chat: true,
      smsAlerts: true,
      smsIncludedMonthly: 50,
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
    maxPages: 10,
    monthlyUpdates: 5,
    highlights: [
      "Everything in Connect, plus:",
      "AI chat assistant & follow-ups",
      "Payments, invoices & receipts",
      "Customer payment portal",
      "AI lead scoring & summaries",
      "100 AI replies + 25 invoices / mo",
    ],
    featureFlags: {
      planName: "Automate",
      setupFee: 999,
      monthlyFee: 179,
      maxPages: 10,
      monthlyUpdates: 5,
      contactForm: true,
      basicAnalytics: true,
      hosting: true,
      ssl: true,
      customDomain: true,
      booking: true,
      chat: true,
      smsAlerts: true,
      smsIncludedMonthly: 100,
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
      aiRepliesIncludedMonthly: 100,
      invoicesIncludedMonthly: 25,
    },
  },
];

export const PRICING_NOTE =
  "Payment processing fees are charged separately by Stripe. SMS and AI usage include monthly limits. Additional usage or custom work may be billed separately.";

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

/** The cheapest plan whose feature flags enable `flag` (e.g. "booking" → Connect). */
export function planForFlag(flag: string): PlanDef | undefined {
  return PLANS.find((p) => p.featureFlags[flag] === true);
}
