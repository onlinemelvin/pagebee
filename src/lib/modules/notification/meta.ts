import type { EmailCategory } from "@prisma/client";

/**
 * Notification metadata — the single catalog that drives both the in-app bell and
 * the per-group email opt-in. Every notification `type` (usually the same string as
 * the email template key, e.g. "preview_ready", or a domain event like
 * "lead.created") maps to a dashboard presentation here.
 *
 * `icon` is a lucide-react icon NAME resolved client-side in the Topbar bell.
 * `group` ties the notification to an email opt-in toggle (see preferences.ts);
 * `null` group = always-on (security/account/onboarding — never silenced).
 */
export const NOTIFICATION_GROUPS = ["inquiries", "appointments", "billing", "website"] as const;
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number];

export const GROUP_LABELS: Record<NotificationGroup, { title: string; desc: string }> = {
  inquiries: { title: "New inquiries", desc: "When a visitor sends a message or lead from your website." },
  appointments: { title: "Appointment requests", desc: "When a customer requests or changes a booking." },
  billing: { title: "Billing & payments", desc: "Receipts, renewals, and plan changes." },
  website: { title: "Website & account", desc: "Preview ready, updates published, and usage reminders." },
};

export type NotificationLevel = "info" | "success" | "warning";

export interface NotifMeta {
  icon: string; // lucide-react icon name (mapped in Topbar)
  href: string; // where the bell entry links to
  title: string; // default dashboard title (overridable per-call)
  group: NotificationGroup | null; // email opt-in group; null = always email
  level: NotificationLevel;
}

/** Keyed by notification `type`. Falls back to DEFAULT_META for unknown types. */
export const NOTIF_META: Record<string, NotifMeta> = {
  // — Website lifecycle ------------------------------------------------------
  preview_ready: { icon: "Eye", href: "/client/website", title: "Your preview is ready", group: "website", level: "success" },
  preview_auto_release_reminder: { icon: "Clock", href: "/client/website", title: "Your preview is waiting", group: "website", level: "info" },
  site_published: { icon: "Rocket", href: "/client/website", title: "Your website is live", group: "website", level: "success" },
  update_approved: { icon: "CheckCircle2", href: "/client/website", title: "Your update is live", group: "website", level: "success" },
  update_rejected: { icon: "AlertTriangle", href: "/client/website", title: "Update needs your attention", group: "website", level: "warning" },
  setup_fee_pending: { icon: "Rocket", href: "/client/launch", title: "One step left to launch", group: "website", level: "info" },
  quota_warning: { icon: "Gauge", href: "/client/billing", title: "Nearing your monthly limit", group: "website", level: "warning" },
  domain_active: { icon: "Globe", href: "/client/website", title: "Your custom domain is live", group: "website", level: "success" },

  // — Billing ----------------------------------------------------------------
  payment_receipt: { icon: "Receipt", href: "/client/billing", title: "Payment received", group: "billing", level: "success" },
  "payment.disputed": { icon: "AlertTriangle", href: "/client/invoices/payments", title: "A payment was disputed", group: null, level: "warning" }, // critical — always
  "payment.dispute_won": { icon: "CheckCircle2", href: "/client/invoices/payments", title: "You won a payment dispute", group: "billing", level: "success" },
  "payment.dispute_lost": { icon: "XCircle", href: "/client/invoices/payments", title: "A payment dispute was lost", group: "billing", level: "warning" },
  "recurring.authorized": { icon: "Receipt", href: "/client/invoices/recurring", title: "Automatic payments authorized", group: "billing", level: "success" },
  payment_failed: { icon: "AlertTriangle", href: "/client/billing", title: "Payment didn't go through", group: null, level: "warning" }, // critical — always
  renewal_notice: { icon: "CalendarClock", href: "/client/billing", title: "Your plan renews soon", group: "billing", level: "info" },
  subscription_cancelled: { icon: "XCircle", href: "/client/billing", title: "Subscription cancelled", group: null, level: "warning" },
  plan_changed: { icon: "Sparkles", href: "/client/billing", title: "Your plan was updated", group: "billing", level: "info" },

  // — Onboarding / account ---------------------------------------------------
  welcome: { icon: "PartyPopper", href: "/client", title: "Welcome to PageBee", group: null, level: "info" },

  // — Activity (no dedicated email template — built inline by subscribers) ----
  "lead.created": { icon: "Inbox", href: "/client/inquiries", title: "New inquiry received", group: "inquiries", level: "info" },
  "booking.created": { icon: "CalendarCheck", href: "/client/appointments", title: "New appointment request", group: "appointments", level: "info" },
  "support.replied": { icon: "LifeBuoy", href: "/client?support=1", title: "Support replied to your ticket", group: null, level: "info" },
};

export const DEFAULT_META: NotifMeta = { icon: "Bell", href: "/client", title: "Notification", group: null, level: "info" };

export function metaForType(type: string): NotifMeta {
  return NOTIF_META[type] ?? DEFAULT_META;
}

/**
 * Map an email category to its opt-in group, used when an email is funnelled
 * through toClient() without an explicit type. `null` = always send (security,
 * account, onboarding, customer-facing).
 */
export function groupForCategory(category: EmailCategory): NotificationGroup | null {
  switch (category) {
    case "BILLING":
      return "billing";
    case "WEBSITE":
    case "USAGE":
      return "website";
    // AUTH, ACCOUNT, WELCOME and all CUSTOMER_* are never owner-silenced.
    default:
      return null;
  }
}
