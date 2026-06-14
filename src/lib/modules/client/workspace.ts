import { cache } from "react";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth/session";
import { planForFlag } from "@/lib/plans";

export interface PreviewInfo {
  status: string; // PreviewStatus or "NONE"
  daysLeft: number | null; // until expiry
  ready: boolean; // a fresh preview is ready to review (PREVIEW_READY)
  viewable: boolean; // a released version exists → the client can always open /preview
  reviewing: boolean; // a newer revision is pending review while a released preview is still shown
  live: boolean; // launched
  awaitingPayment: boolean; // approved, setup fee due
  expired: boolean;
  revisionsLeft: number;
  canComment: boolean; // may mark up the preview (reviewable + revisions left)
  url: string | null; // preview/live site URL
}
export interface Tab {
  key: string;
  label: string;
  href: string;
  badge?: number;
}
export interface OnboardingStep {
  key: string;
  title: string;
  done: boolean;
  optional: boolean;
}
export interface ActionItem {
  title: string;
  desc: string;
  href: string;
  cta: string;
  primary?: boolean;
}
export interface FeatureCardInfo {
  key: string;
  title: string;
  desc: string;
  // enabled: on plan & active (can disable) · available: on plan but off (can enable) ·
  // locked: not on this plan (upgrade to unlock).
  state: "enabled" | "available" | "locked";
  toggleKey?: string; // feature_flags key to enable/disable (enabled/available states)
  disclaimer?: string; // shown in a confirm modal before enabling (responsibility warning)
  toPlan?: string; // for locked — target plan name
  toPlanLabel?: string; // for locked — target plan label
}

// Catalog of features surfaced as cards. `flag` is the plan feature-flag that unlocks it (null =
// every plan). `defaultOn` is the default state when on-plan with no client override: Lead capture
// is on by default (tier 2+); the gallery's default is set at generation from the owner's photo
// choice; everything else is OFF until the owner explicitly turns it on (with a disclaimer).
const FEATURE_CATALOG: {
  key: string;
  flag: string | null;
  defaultOn: boolean;
  title: string;
  desc: string;
  disclaimer?: string;
}[] = [
  { key: "gallery", flag: null, defaultOn: false, title: "Photo gallery", desc: "Showcase your work in a polished image gallery." },
  { key: "forms", flag: "contactForm", defaultOn: true, title: "Lead capture form", desc: "Let visitors send inquiries straight from your site." },
  {
    key: "booking",
    flag: "booking",
    defaultOn: false,
    title: "Appointments & scheduling",
    desc: "Let customers book appointments online.",
    disclaimer:
      "Customers will be able to book time slots directly. Confirm or decline requests promptly — unanswered bookings frustrate customers and cost you the job.",
  },
  {
    key: "chat",
    flag: "chat",
    defaultOn: false,
    title: "Website chat",
    desc: "Answer visitors with a live chat widget.",
    disclaimer:
      "Chat messages arrive in your inbox as text messages, and you should reply to them fast. Enabling chat and not replying in time will actually hurt your conversion.",
  },
  {
    key: "sms",
    flag: "smsAlerts",
    defaultOn: false,
    title: "SMS lead alerts",
    desc: "Get a text the moment a new lead comes in.",
    disclaimer:
      "You'll get a text for every new lead. Standard SMS rates and monthly limits apply — reply quickly to win the lead while it's still warm.",
  },
  {
    key: "payments",
    flag: "invoices",
    defaultOn: false,
    title: "Invoices & payments",
    desc: "Send invoices and take card payments online.",
    disclaimer:
      "You'll be collecting real payments. You must connect a payout account and handle refunds and disputes yourself — double-check your pricing and tax details before turning this on.",
  },
  {
    key: "ai",
    flag: "aiAssistant",
    defaultOn: false,
    title: "AI assistant",
    desc: "AI chat that answers questions and follows up with leads.",
    disclaimer:
      "The AI answers visitors on your behalf from your knowledge base. Review it carefully — AI can make mistakes, and a wrong answer can mislead a customer.",
  },
  {
    key: "domain",
    flag: "customDomain",
    defaultOn: false,
    title: "Custom domain",
    desc: "Connect your own domain name.",
    disclaimer:
      "Connecting a custom domain requires DNS changes that you control. A misconfiguration can take your site offline until it's corrected.",
  },
];
export interface ClientWorkspace {
  email: string;
  client: { id: string; businessName: string; ownerName: string | null; isTest: boolean };
  planName: string;
  caps: { forms: boolean; booking: boolean; invoices: boolean; ai: boolean; maxPages: number; teamSeats: number };
  choices: { booking: boolean | null; invoices: boolean | null };
  website: { exists: boolean; published: boolean; subdomain: string | null; latestVersionStatus: string | null };
  counts: { newInquiries: number; pendingAppointments: number };
  onboarding: { steps: OnboardingStep[]; complete: boolean };
  preview: PreviewInfo;
  quota: { allowance: number; used: number; remaining: number };
  features: FeatureCardInfo[];
  tabs: Tab[];
  actions: ActionItem[];
}

/** Everything the client dashboard needs to render itself: plan capabilities, the
 *  client's opt-in choices, onboarding progress, surfaced action items, and the
 *  tabs to show. Returns null if not signed in as a client. */
async function getClientWorkspaceRaw(): Promise<ClientWorkspace | null> {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const membership = await prisma.clientUser.findFirst({
    where: { userId: ctx.userId },
    include: {
      client: {
        include: {
          subscription: { include: { plan: true } },
          websites: {
            include: {
              versions: {
                orderBy: { version: "desc" },
                take: 1,
                include: { config: { select: { adminReviewed: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!membership) return null;
  const client = membership.client;

  const planFlags = (client.subscription?.plan.featureFlags ?? {}) as Record<string, unknown>;
  const caps = {
    forms: Boolean(planFlags.contactForm),
    booking: Boolean(planFlags.booking),
    invoices: Boolean(planFlags.invoices ?? planFlags.payments),
    ai: Boolean(planFlags.aiAssistant),
    maxPages: Number(planFlags.maxPages ?? 5),
    teamSeats: Number(planFlags.teamSeats ?? 1),
  };

  const site = client.websites[0];

  // Everything below only needs client.id — fire the independent reads together instead of
  // awaiting them one after another (saves a few hundred ms per dashboard load).
  // Monthly minor-update usage = WebsiteUpdate rows this calendar month (UTC). See subscription
  // module; computed inline here to reuse the already-loaded plan + avoid an extra query.
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

  const [flags, previewRow, releasedCount, newInquiries, pendingAppointments, updatesUsed] = await Promise.all([
    prisma.featureFlag.findMany({ where: { clientId: client.id }, take: 50 }),
    prisma.preview.findFirst({ where: { clientId: client.id }, orderBy: { createdAt: "desc" } }),
    // Any released (admin-approved) version? (The LATEST version's reviewed flag comes from the
    // membership query above, so no extra round-trip is needed for it.)
    site
      ? prisma.websiteVersion.count({ where: { websiteId: site.id, config: { adminReviewed: true } } })
      : Promise.resolve(0),
    prisma.lead.count({ where: { clientId: client.id, status: "NEW" } }),
    planFlags.booking
      ? prisma.booking.count({ where: { clientId: client.id, status: "REQUESTED" } })
      : Promise.resolve(0),
    prisma.websiteUpdate.count({
      where: { clientId: client.id, status: { not: "rejected" }, createdAt: { gte: monthStart } },
    }),
  ]);

  // Monthly minor-update quota (from the already-loaded plan).
  const updateAllowance = Number(client.subscription?.plan.monthlyUpdates ?? 1);
  const quota = {
    allowance: updateAllowance,
    used: updatesUsed,
    remaining: Math.max(0, updateAllowance - updatesUsed),
  };

  // Per-client feature overrides (feature_flags) layered over plan defaults. Booking & invoices are
  // explicit opt-ins — off until the owner turns them on (via the feature cards + disclaimers).
  const overrides = new Map(flags.map((f) => [f.key, f.enabled]));
  const choices = { booking: overrides.get("booking") === true, invoices: overrides.get("invoices") === true };

  const latestVersion = site?.versions[0];
  const website = {
    exists: Boolean(latestVersion),
    published: site?.status === "published",
    subdomain: site?.subdomain ?? null,
    latestVersionStatus: latestVersion?.status ?? null,
  };

  // ── Preview lifecycle (preview-before-you-pay) ──
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const proto = rootDomain.includes("localhost") ? "http" : "https";
  const previewDaysLeft = previewRow?.expiresAt
    ? Math.max(0, Math.ceil((previewRow.expiresAt.getTime() - Date.now()) / 86_400_000))
    : null;

  // A released version means the client can always open /preview; if the latest is newer and
  // still unreleased, a revision is in our review queue ("reviewing").
  const releasedExists = releasedCount > 0;
  const latestReviewed = latestVersion?.config?.adminReviewed === true;
  const previewStatus = previewRow?.status ?? "NONE";
  const isLiveOrGone = previewStatus === "LIVE" || previewStatus === "EXPIRED";

  const preview: PreviewInfo = {
    status: previewStatus,
    daysLeft: previewDaysLeft,
    ready: previewRow?.status === "PREVIEW_READY",
    viewable: releasedExists && !isLiveOrGone,
    reviewing: releasedExists && !latestReviewed && !isLiveOrGone,
    live: previewRow?.status === "LIVE",
    awaitingPayment: previewRow?.status === "APPROVED" || previewRow?.status === "SETUP_FEE_PENDING",
    expired: previewRow?.status === "EXPIRED",
    revisionsLeft: previewRow ? Math.max(0, previewRow.maxFreeRevisions - previewRow.revisionCount) : 0,
    canComment:
      previewRow?.status === "PREVIEW_READY" &&
      previewRow.maxFreeRevisions - previewRow.revisionCount > 0,
    // Live sites are at their real host; in-preview sites are only viewable by the
    // signed-in owner at the authenticated /preview route (never on the public host).
    url:
      previewRow?.status === "LIVE" && site?.subdomain
        ? `${proto}://${site.subdomain}.${rootDomain}`
        : previewRow
          ? "/preview"
          : null,
  };

  // newInquiries + pendingAppointments were loaded in parallel above.

  // ── Onboarding steps (only what's relevant to this plan) ──
  const steps: OnboardingStep[] = [
    { key: "website", title: "Create your website", done: website.exists, optional: false },
  ];
  if (caps.booking) steps.push({ key: "booking", title: "Take appointments", done: choices.booking, optional: true });
  if (caps.invoices) steps.push({ key: "invoices", title: "Send invoices", done: choices.invoices, optional: true });
  const complete = steps.every((s) => s.done);

  // ── Tabs (auto-customized) ──
  const tabs: Tab[] = [
    { key: "overview", label: "Overview", href: "/client" },
    { key: "inquiries", label: "Inquiries", href: "/client/inquiries", badge: newInquiries || undefined },
  ];
  if (caps.booking && choices.booking) {
    tabs.push({ key: "appointments", label: "Appointments", href: "/client/appointments", badge: pendingAppointments || undefined });
  }
  if (caps.invoices && choices.invoices) {
    tabs.push({ key: "invoices", label: "Finance", href: "/client/invoices" });
  }
  tabs.push({ key: "services", label: "Services", href: "/client/services" });
  tabs.push({ key: "website", label: "Website", href: "/client/website" });
  tabs.push({ key: "media", label: "Media", href: "/client/media" });

  // ── Surfaced action items ──
  const actions: ActionItem[] = [];
  const settingUp = preview.status === "IN_REVIEW" || preview.status === "PREVIEW_GENERATING";
  if (!website.exists && !settingUp) {
    actions.push({ title: "Create your free preview", desc: "Tell us about your business and we'll generate your site.", href: "/client/website", cta: "Start", primary: true });
  } else if (settingUp) {
    actions.push({ title: "We're setting up your website", desc: "This can take up to 48 hours (usually a few). We'll have your preview ready to review — check back later.", href: "/client/website", cta: "View status", primary: true });
  } else if (preview.ready) {
    actions.push({ title: "Your preview is ready", desc: "Review it, request a change, or approve & launch.", href: "/client", cta: "Review", primary: true });
  } else if (preview.awaitingPayment) {
    actions.push({ title: "Approve & launch", desc: "Pay the one-time setup fee to take your site live.", href: "/client/billing", cta: "Continue", primary: true });
  } else if (preview.expired) {
    actions.push({ title: "Your preview expired", desc: "Regenerate it whenever you're ready.", href: "/client/website", cta: "Regenerate" });
  }
  if (newInquiries > 0) {
    actions.push({ title: `${newInquiries} new inquir${newInquiries === 1 ? "y" : "ies"}`, desc: "Respond to messages from your website.", href: "/client/inquiries", cta: "Open" });
  }
  if (caps.booking && choices.booking && pendingAppointments > 0) {
    actions.push({ title: `${pendingAppointments} appointment request${pendingAppointments === 1 ? "" : "s"}`, desc: "Confirm or cancel pending bookings.", href: "/client/appointments", cta: "Review" });
  }
  if (!complete) {
    actions.push({ title: "Finish setting up", desc: "A few quick steps to tailor your account.", href: "/client", cta: "Continue" });
  }

  // ── Feature cards: enabled (on), available (on plan but off → enable), or locked (upgrade). ──
  const features: FeatureCardInfo[] = FEATURE_CATALOG.map((f) => {
    const toggleKey = f.flag ?? "gallery";
    if (f.flag && !planFlags[f.flag]) {
      const target = planForFlag(f.flag);
      return { key: f.key, title: f.title, desc: f.desc, state: "locked" as const, toPlan: target?.name, toPlanLabel: target?.label };
    }
    // On plan (or gallery): the override wins; otherwise the feature's default-on policy applies.
    const ov = overrides.get(toggleKey);
    const on = ov !== undefined ? ov : f.defaultOn;
    return {
      key: f.key,
      title: f.title,
      desc: f.desc,
      state: on ? ("enabled" as const) : ("available" as const),
      toggleKey,
      disclaimer: f.disclaimer,
    };
  });

  return {
    email: ctx.email,
    client: { id: client.id, businessName: client.businessName, ownerName: client.ownerName, isTest: client.isTest },
    planName: client.subscription?.plan.name ?? "—",
    caps,
    choices,
    website,
    counts: { newInquiries, pendingAppointments },
    onboarding: { steps, complete },
    preview,
    quota,
    features,
    tabs,
    actions,
  };
}

// Per-request memoization: the client layout AND the page both need the workspace; cache() makes
// them share one execution (instead of running the full query set twice on every navigation).
export const getClientWorkspace = cache(getClientWorkspaceRaw);

/** Persist a client's feature opt-in (booking / invoices). */
export async function setClientFeature(clientId: string, key: string, enabled: boolean) {
  await prisma.featureFlag.upsert({
    where: { clientId_key: { clientId, key } },
    update: { enabled },
    create: { clientId, key, enabled },
  });
}
