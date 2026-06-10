import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth/session";
import { trialDaysLeft } from "@/lib/modules/billing/trial";

export interface TrialInfo {
  status: string;
  daysLeft: number | null;
  ended: boolean;
  cardSkipped: boolean;
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
  trial: TrialInfo;
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

  const sub = client.subscription;
  const trial: TrialInfo = {
    status: sub?.status ?? "NONE",
    daysLeft: trialDaysLeft(sub?.trialEndsAt),
    ended: sub?.status === "SUSPENDED",
    cardSkipped: choice("trial.cardSkipped") === true,
  };

  const site = client.websites[0];
  const latestVersion = site?.versions[0];
  const website = {
    exists: Boolean(latestVersion),
    published: site?.status === "published",
    subdomain: site?.subdomain ?? null,
    latestVersionStatus: latestVersion?.status ?? null,
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
  if (trial.ended) {
    actions.push({ title: "Your trial has ended", desc: "Add a card to bring your site back online.", href: "/client/billing", cta: "Reactivate", primary: true });
  }
  if (!website.exists) {
    actions.push({ title: "Create your website", desc: "Generate your site to get online.", href: "/client/website", cta: "Start", primary: true });
  } else if (website.latestVersionStatus === "PREVIEW" && !client.isTest) {
    actions.push({ title: "Website in review", desc: "We're reviewing your draft before it goes live.", href: "/client/website", cta: "View" });
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
    trial,
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
