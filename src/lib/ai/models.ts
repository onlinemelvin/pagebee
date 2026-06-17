// Central model tiers for AI calls, so cost/quality is tunable per environment without code
// changes. The QUALITY tier handles the user-facing website HTML (build + surgical edits); the
// CHEAP tier handles trivial structured calls (config copy, service icon/description, image-edit
// triage) where a small model is just as good. Override either via env to bump or cut.

/** Website HTML generation + surgical edits. Override with ANTHROPIC_MODEL. */
export const QUALITY_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

/** Trivial structured calls (config copy, service meta, image triage). Override with ANTHROPIC_MODEL_CHEAP. */
export const CHEAP_MODEL = process.env.ANTHROPIC_MODEL_CHEAP ?? "claude-haiku-4-5";

/**
 * When AI_FORCE_STUB=true, skip ALL paid AI calls and fall back to the deterministic stubs —
 * free local testing of layout, the serve pipeline, and the dashboard without burning credits.
 */
export const AI_FORCE_STUB = process.env.AI_FORCE_STUB === "true";
