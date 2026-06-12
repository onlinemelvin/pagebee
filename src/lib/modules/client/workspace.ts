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
export interface UpsellItem {
  reason: "appointments" | "more_updates";
  title: string;
  desc: string;
  toPlan: string; // target plan name (e.g. "CONNECT")
  ctaLabel: string;
}
export interface ClientWorkspace {
  email: string;
  client: { id: string; businessName: string; ownerName: string | null; isTest: boolean };
  planName: string;
  caps: { forms: boolean; booking: boolean; invoices: boolean; ai: boolean; maxPages: number };
  choices: { booking: boolean | null; invoices: boolean | null };
  website: { exists: boolean; published: boolean; subdomain: string | null; latestVersionStatus: string | null };
  counts: { newInquiries: number; pendingAppointments: number };
  onboarding: { steps: OnboardingStep[]; complete: boolean };
  preview: PreviewInfo;
  quota: { allowance: number; used: number; remaining: number };
  upsells: UpsellItem[];
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

  const flagMap = new Map(flags.map((f) => [f.key, f.enabled]));
  const choice = (k: string): boolean | null => (flagMap.has(k) ? Boolean(flagMap.get(k)) : null);
  const choices = { booking: choice("booking"), invoices: choice("invoices") };

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
  if (caps.booking) steps.push({ key: "booking", title: "Take appointments", done: choices.booking !== null, optional: true });
  if (caps.invoices) steps.push({ key: "invoices", title: "Send invoices", done: choices.invoices !== null, optional: true });
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
    tabs.push({ key: "invoices", label: "Invoices", href: "/client/invoices" });
  }
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

  // ── Upsells ──
  const upsells: UpsellItem[] = [];
  // Launch (no booking) → upsell appointments by upgrading to the cheapest plan that includes it.
  if (!caps.booking && website.exists) {
    const target = planForFlag("booking"); // Connect
    if (target) {
      upsells.push({
        reason: "appointments",
        title: "Add online booking & scheduling",
        desc: "Let customers book appointments right from your website.",
        toPlan: target.name,
        ctaLabel: `Upgrade to ${target.label}`,
      });
    }
  }

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
    upsells,
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
