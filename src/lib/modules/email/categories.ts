import type { EmailCategory } from "@prisma/client";

/**
 * Email category metadata. The TRANSACTIONAL set is account mail PageBee is
 * obligated to send (receipts, security, password reset) — it never carries an
 * unsubscribe link and ignores the suppression list. The MARKETING set (tips,
 * announcements, promotions) is suppressible and always renders a one-click
 * unsubscribe footer. See prisma EmailCategory enum + preferences.ts.
 */
export const MARKETING_CATEGORIES = ["TIPS", "ANNOUNCEMENT", "PROMOTION"] as const;

const MARKETING_SET = new Set<EmailCategory>(MARKETING_CATEGORIES);

/** True when a category is marketing (suppressible, needs an unsubscribe link). */
export function isMarketing(category: EmailCategory): boolean {
  return MARKETING_SET.has(category);
}

/** Human label for the admin dashboard + unsubscribe copy. */
export const CATEGORY_LABELS: Record<EmailCategory, string> = {
  WELCOME: "Welcome",
  AUTH: "Security & sign-in",
  BILLING: "Billing & receipts",
  WEBSITE: "Website updates",
  USAGE: "Usage & reminders",
  ACCOUNT: "Account changes",
  TIPS: "Tips & how-tos",
  ANNOUNCEMENT: "Product announcements",
  PROMOTION: "Offers & promotions",
};
