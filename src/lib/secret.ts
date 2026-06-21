// Centralized resolution of HMAC signing secrets.
//
// Token-signing schemes (Stripe Connect `state`, iCal feed URLs, customer
// unsubscribe links) must never fall back to a hardcoded literal or to an
// unrelated, rotatable credential (e.g. an API key) — a known/guessable key
// makes every signed token forgeable. This helper FAILS CLOSED in production:
// if none of the configured env vars hold a non-empty value it throws, so a
// forgotten secret surfaces immediately instead of silently degrading to a
// trivially-forgeable signature. In non-production it returns a stable, clearly
// insecure per-scheme default so local dev still works without configuration.

/**
 * Resolve a signing secret from `envNames` in priority order (first non-empty
 * wins). Throws in production when none is set; returns a dev-only insecure
 * default otherwise.
 */
export function signingSecret(...envNames: [string, ...string[]]): string {
  for (const name of envNames) {
    const v = process.env[name];
    if (v && v.trim().length > 0) return v;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `Missing signing secret: set one of ${envNames.join(", ")} in the environment.`,
    );
  }
  // Dev/test only — deterministic per primary env name so tokens verify within a session.
  return `dev-insecure-secret:${envNames[0]}`;
}
