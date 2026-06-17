import { cache } from "react";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth/session";
import { planForFlag, nextTier } from "@/lib/plans";
import { autoReleaseStalePreview } from "@/lib/modules/website";

export interface PreviewInfo {
  status: string; // PreviewStatus or "NONE"
  ready: boolean; // a fresh preview is ready to review (PREVIEW_READY)
  viewable: boolean; // a released version exists → the client can always open /preview
  reviewing: boolean; // a newer revision is pending review while a released preview is still shown
  live: boolean; // launched
  updateInReview: boolean; // live site has a newer version being prepared (not yet released to review)
  awaitingPayment: boolean; // approved, setup fee due
  revisionsLeft: number;
  canComment: boolean; // may mark up the preview (reviewable + revisions left)
  url: string | null; // preview/live site URL
}
export interface Tab {
  key: string;
  label: string;
  href: string;
  badge?: number;
  tier?: 1 | 2 | 3; // tier the feature belongs to — used to group the nav (1 = base, 2/3 = premium)
  locked?: boolean; // the current plan doesn't include this feature → shown as an upsell, gated on open
  lockLabel?: string; // plan that unlocks it (e.g. "Connect") — rendered as a small tag on locked items
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
  blockedReason?: string; // on an "available" feature, why it can't be enabled right now (e.g. no page slots left)
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
  // NOTE: Custom domain is intentionally NOT a feature card — it needs a domain + DNS + admin
  // review, not a simple on/off toggle. It has its own panel (CustomDomainPanel) on the website
  // page, gated by caps.customDomain. See src/lib/modules/website/domain.ts.
];
// Canonical sidebar nav. Every feature tab is ALWAYS surfaced (for all tiers) so lower-tier owners
// see what's available and can be upsold — a tab whose `flag` isn't on the plan renders locked and,
// when opened, shows an upgrade gate. `tier` drives the grouped layout (base → premium). `needsSite`
// tabs (services/media) are pure content with nothing to upsell, so they stay hidden until a site
// exists. `planForFlag(flag)` resolves the unlocking plan for the tag + gate message.
const NAV_CATALOG: { key: string; label: string; href: string; tier: 1 | 2 | 3; flag: string | null; needsSite?: boolean }[] = [
  { key: "overview", label: "Overview", href: "/client", tier: 1, flag: null },
  { key: "website", label: "Website", href: "/client/website", tier: 1, flag: null },
  { key: "services", label: "Services", href: "/client/services", tier: 1, flag: null, needsSite: true },
  { key: "media", label: "Media", href: "/client/media", tier: 1, flag: null, needsSite: true },
  { key: "inquiries", label: "Inquiries", href: "/client/inquiries", tier: 2, flag: "contactForm" },
  { key: "customers", label: "Customers", href: "/client/customers", tier: 2, flag: null },
  { key: "appointments", label: "Appointments", href: "/client/appointments", tier: 2, flag: "booking" },
  { key: "invoices", label: "Finance", href: "/client/invoices", tier: 3, flag: "invoices" },
];

export interface ClientWorkspace {
  email: string;
  role: string; // "owner" | "staff"
  client: { id: string; businessName: string; ownerName: string | null; isTest: boolean };
  planName: string;
  caps: { forms: boolean; booking: boolean; invoices: boolean; ai: boolean; customDomain: boolean; maxPages: number; teamSeats: number };
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
                include: {
                  config: { select: { adminReviewed: true } },
                  _count: { select: { pages: true } }, // content units used (gates the gallery vs maxPages)
                },
              },
            },
          },
        },
      },
    },
  });
  if (!membership) return null;
  const client = membership.client;

  // SLA failsafe: if a generated preview has sat unreviewed past the 48h window, release it to
  // the client now so they're never stuck waiting on us. No-op unless one is overdue; we await it
  // before reading preview state below so this load reflects the just-released preview.
  await autoReleaseStalePreview(client.id).catch((e) => console.error("[workspace] auto-release failed", e));

  const planFlags = (client.subscription?.plan.featureFlags ?? {}) as Record<string, unknown>;
  const caps = {
    forms: Boolean(planFlags.contactForm),
    booking: Boolean(planFlags.booking),
    invoices: Boolean(planFlags.invoices ?? planFlags.payments),
    ai: Boolean(planFlags.aiAssistant),
    customDomain: Boolean(planFlags.customDomain),
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

  // Previews are evergreen — they never expire. A released version means the client can always open
  // /preview; if the latest is newer and still unreleased, a revision is in our review queue.
  const releasedExists = releasedCount > 0;
  const latestReviewed = latestVersion?.config?.adminReviewed === true;
  const previewStatus = previewRow?.status ?? "NONE";
  const isLive = previewStatus === "LIVE";

  const preview: PreviewInfo = {
    status: previewStatus,
    ready: previewRow?.status === "PREVIEW_READY",
    viewable: releasedExists && !isLive,
    reviewing: releasedExists && !latestReviewed && !isLive,
    live: previewRow?.status === "LIVE",
    // Published site whose latest version is a not-yet-released update (being generated/reviewed).
    updateInReview: site?.status === "published" && Boolean(latestVersion) && !latestReviewed,
    awaitingPayment: previewRow?.status === "APPROVED" || previewRow?.status === "SETUP_FEE_PENDING",
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

  // ── Tabs (grouped by tier; every feature surfaced for upsell) ──
  // Premium tabs always appear, locked when off-plan; content-only tabs (services/media) wait for a
  // site. Badges come from the counts loaded above. Opening a locked tab hits its page's UpgradeGate.
  const tabs: Tab[] = [];
  for (const item of NAV_CATALOG) {
    if (item.needsSite && !website.exists) continue;
    const onPlan = !item.flag || Boolean(planFlags[item.flag]);
    const badge =
      item.key === "inquiries" ? newInquiries || undefined
      : item.key === "appointments" ? pendingAppointments || undefined
      : undefined;
    tabs.push({
      key: item.key,
      label: item.label,
      href: item.href,
      tier: item.tier,
      badge,
      locked: !onPlan,
      lockLabel: onPlan ? undefined : planForFlag(item.flag!)?.name,
    });
  }

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
  // Content units the current site uses (Home/Services/Contact/…) — the gallery adds one, so we
  // can't let it be enabled once every page/section slot in the plan is already taken.
  const usedPages = site?.versions[0]?._count?.pages ?? 0;

  const features: FeatureCardInfo[] = FEATURE_CATALOG.map((f) => {
    const toggleKey = f.flag ?? "gallery";
    if (f.flag && !planFlags[f.flag]) {
      const target = planForFlag(f.flag);
      return { key: f.key, title: f.title, desc: f.desc, state: "locked" as const, toPlan: target?.name, toPlanLabel: target?.label };
    }
    // On plan (or gallery): the override wins; otherwise the feature's default-on policy applies.
    const ov = overrides.get(toggleKey);
    const on = ov !== undefined ? ov : f.defaultOn;
    // The gallery is a content unit — block enabling it when the site is already at its page limit.
    const blockedReason =
      f.key === "gallery" && !on && usedPages >= caps.maxPages
        ? `Your plan includes up to ${caps.maxPages} pages & sections, and they're all in use. Remove one (or upgrade) to add a gallery.`
        : undefined;
    // When blocked for room, offer the next tier that actually grants MORE pages.
    const up = blockedReason ? nextTier(client.subscription?.plan.name ?? "") : null;
    const upgrade = up && up.maxPages > caps.maxPages ? { toPlan: up.name, toPlanLabel: up.label } : {};
    return {
      key: f.key,
      title: f.title,
      desc: f.desc,
      state: on ? ("enabled" as const) : ("available" as const),
      toggleKey,
      disclaimer: f.disclaimer,
      blockedReason,
      ...upgrade,
    };
  });

  return {
    email: ctx.email,
    role: membership.role,
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
