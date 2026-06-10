import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth/session";

export interface PreviewInfo {
  status: string; // PreviewStatus or "NONE"
  daysLeft: number | null; // until expiry
  ready: boolean; // reviewable
  live: boolean; // launched
  awaitingPayment: boolean; // approved, setup fee due
  expired: boolean;
  revisionsLeft: number;
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
export interface ClientWorkspace {
  email: string;
  client: { id: string; businessName: string; ownerName: string | null; isTest: boolean };
  planName: string;
  caps: { booking: boolean; invoices: boolean; ai: boolean };
  choices: { booking: boolean | null; invoices: boolean | null };
  website: { exists: boolean; published: boolean; subdomain: string | null; latestVersionStatus: string | null };
  counts: { newInquiries: number; pendingAppointments: number };
  onboarding: { steps: OnboardingStep[]; complete: boolean };
  preview: PreviewInfo;
  tabs: Tab[];
  actions: ActionItem[];
}

/** Everything the client dashboard needs to render itself: plan capabilities, the
 *  client's opt-in choices, onboarding progress, surfaced action items, and the
 *  tabs to show. Returns null if not signed in as a client. */
export async function getClientWorkspace(): Promise<ClientWorkspace | null> {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const membership = await prisma.clientUser.findFirst({
    where: { userId: ctx.userId },
    include: {
      client: {
        include: {
          subscription: { include: { plan: true } },
          websites: { include: { versions: { orderBy: { version: "desc" }, take: 1 } } },
        },
      },
    },
  });
  if (!membership) return null;
  const client = membership.client;

  const planFlags = (client.subscription?.plan.featureFlags ?? {}) as Record<string, unknown>;
  const caps = {
    booking: Boolean(planFlags.booking),
    invoices: Boolean(planFlags.invoices ?? planFlags.payments),
    ai: Boolean(planFlags.aiAssistant),
  };

  const flags = await prisma.featureFlag.findMany({ where: { clientId: client.id } });
  const flagMap = new Map(flags.map((f) => [f.key, f.enabled]));
  const choice = (k: string): boolean | null => (flagMap.has(k) ? Boolean(flagMap.get(k)) : null);
  const choices = { booking: choice("booking"), invoices: choice("invoices") };

  const site = client.websites[0];
  const latestVersion = site?.versions[0];
  const website = {
    exists: Boolean(latestVersion),
    published: site?.status === "published",
    subdomain: site?.subdomain ?? null,
    latestVersionStatus: latestVersion?.status ?? null,
  };

  // ── Preview lifecycle (preview-before-you-pay) ──
  const previewRow = await prisma.preview.findFirst({
    where: { clientId: client.id },
    orderBy: { createdAt: "desc" },
  });
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const proto = rootDomain.includes("localhost") ? "http" : "https";
  const previewDaysLeft = previewRow?.expiresAt
    ? Math.max(0, Math.ceil((previewRow.expiresAt.getTime() - Date.now()) / 86_400_000))
    : null;
  const preview: PreviewInfo = {
    status: previewRow?.status ?? "NONE",
    daysLeft: previewDaysLeft,
    ready: previewRow?.status === "PREVIEW_READY",
    live: previewRow?.status === "LIVE",
    awaitingPayment: previewRow?.status === "APPROVED" || previewRow?.status === "SETUP_FEE_PENDING",
    expired: previewRow?.status === "EXPIRED",
    revisionsLeft: previewRow ? Math.max(0, previewRow.maxFreeRevisions - previewRow.revisionCount) : 0,
    url: site?.subdomain ? `${proto}://${site.subdomain}.${rootDomain}` : null,
  };

  const [newInquiries, pendingAppointments] = await Promise.all([
    prisma.lead.count({ where: { clientId: client.id, status: "NEW" } }),
    caps.booking
      ? prisma.booking.count({ where: { clientId: client.id, status: "REQUESTED" } })
      : Promise.resolve(0),
  ]);

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

  // ── Surfaced action items ──
  const actions: ActionItem[] = [];
  if (!website.exists) {
    actions.push({ title: "Create your free preview", desc: "Tell us about your business and we'll generate your site.", href: "/client/website", cta: "Start", primary: true });
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
    tabs,
    actions,
  };
}

/** Persist a client's feature opt-in (booking / invoices). */
export async function setClientFeature(clientId: string, key: string, enabled: boolean) {
  await prisma.featureFlag.upsert({
    where: { clientId_key: { clientId, key } },
    update: { enabled },
    create: { clientId, key, enabled },
  });
}
