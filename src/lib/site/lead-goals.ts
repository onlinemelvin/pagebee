// ── Lead-capture goals: the single source of truth for the site's primary action ──────────────
// A "goal" is the owner's chosen primary call-to-action (e.g. "Request a quote"). It is picked once
// at website creation (WebsiteIntakeForm) and can be changed any time afterwards from the Inquiries
// page — with NO site rebuild. The goal drives THREE serve-time things, all derived here so they
// never drift apart:
//   1. the lead `type` stored on every submission (goalToLeadType)
//   2. the label on the page's primary CTA buttons (goalToCtaLabel)
//   3. the form's submit-button label
// The platform applies these at serve time (see src/lib/site/lead-form.ts runtime + the public
// /lead-form endpoint), so a goal change on the dashboard reflects on the live site immediately.

export type LeadType = "CONTACT_FORM" | "QUOTE_REQUEST" | "SERVICE_INQUIRY";

// The goal-derived lead-form state, computed server-side. Inlined into the served page so the runtime
// can label the page's CTA on first paint (no fetch flicker), and returned by the public lead-form
// endpoint so the runtime can reconcile cached pages after a goal/enable change.
export interface LeadFormMeta {
  enabled: boolean;
  ctaLabel: string | null;
  leadType: LeadType | null;
  formBlurb: string | null;
  messagePrompt: string | null;
}

// Canonical primary-CTA options. The same list is shown at website creation AND on the Inquiries
// page so the two never diverge. The string is stored verbatim in Website.leadFormGoal.
export const LEAD_GOALS = [
  "Book an appointment",
  "Request a quote",
  "Request an estimate",
  "Request a callback",
  "Book a free consultation",
  "Request a demo",
  "Send a general message",
] as const;

export type LeadGoal = (typeof LEAD_GOALS)[number];

export function isLeadGoal(value: unknown): value is LeadGoal {
  return typeof value === "string" && (LEAD_GOALS as readonly string[]).includes(value);
}

// Goal → lead type. Mirrors the rule in the generator's lead-capture directive: a quote/estimate is a
// QUOTE_REQUEST; a callback/consultation/demo/appointment/service question is a SERVICE_INQUIRY; a
// general message is a CONTACT_FORM.
const GOAL_TO_TYPE: Record<LeadGoal, LeadType> = {
  "Book an appointment": "SERVICE_INQUIRY",
  "Request a quote": "QUOTE_REQUEST",
  "Request an estimate": "QUOTE_REQUEST",
  "Request a callback": "SERVICE_INQUIRY",
  "Book a free consultation": "SERVICE_INQUIRY",
  "Request a demo": "SERVICE_INQUIRY",
  "Send a general message": "CONTACT_FORM",
};

// Goal → the label shown on the page's primary CTA buttons and the form's submit button. Title-cased
// from the goal so it reads as a button (e.g. "Request a quote" → "Request a Quote").
const GOAL_TO_CTA: Record<LeadGoal, string> = {
  "Book an appointment": "Book an Appointment",
  "Request a quote": "Request a Quote",
  "Request an estimate": "Request an Estimate",
  "Request a callback": "Request a Callback",
  "Book a free consultation": "Book a Free Consultation",
  "Request a demo": "Request a Demo",
  "Send a general message": "Send a Message",
};

// Goal → the form's sub-heading line. Kept generic (no business-specific detail) so it stays correct
// when the owner switches goals after launch, replacing copy the AI may have tailored to the old goal.
const GOAL_TO_BLURB: Record<LeadGoal, string> = {
  "Book an appointment": "Tell us what you need and your preferred time — we'll confirm your appointment shortly.",
  "Request a quote": "Tell us a bit about what you need and we'll get back to you with a competitive quote.",
  "Request an estimate": "Share a few details and we'll send over a no-obligation estimate.",
  "Request a callback": "Leave your details and we'll call you back as soon as we can.",
  "Book a free consultation": "Tell us a little about your needs and we'll set up your free consultation.",
  "Request a demo": "Tell us what you're looking for and we'll arrange a demo that fits.",
  "Send a general message": "Have a question? Send us a message and we'll get right back to you.",
};

export function goalToLeadType(goal: string | null | undefined): LeadType | null {
  return isLeadGoal(goal) ? GOAL_TO_TYPE[goal] : null;
}

export function goalToCtaLabel(goal: string | null | undefined): string | null {
  return isLeadGoal(goal) ? GOAL_TO_CTA[goal] : null;
}

// Goal → the label on the free-text (message) field. Generic for the same reason as the blurb.
const GOAL_TO_PROMPT: Record<LeadGoal, string> = {
  "Book an appointment": "What do you need, and when works for you?",
  "Request a quote": "Tell us what you'd like a quote for.",
  "Request an estimate": "What would you like estimated?",
  "Request a callback": "What should we call you about?",
  "Book a free consultation": "What would you like to discuss?",
  "Request a demo": "What would you like to see in the demo?",
  "Send a general message": "How can we help?",
};

export function goalToFormBlurb(goal: string | null | undefined): string | null {
  return isLeadGoal(goal) ? GOAL_TO_BLURB[goal] : null;
}

export function goalToMessagePrompt(goal: string | null | undefined): string | null {
  return isLeadGoal(goal) ? GOAL_TO_PROMPT[goal] : null;
}

// Shown on the CTA when lead capture is OFF (no form to point at): point at the contact section,
// where the click-to-call/email details always live.
export const CTA_DISABLED_LABEL = "Contact Us";
