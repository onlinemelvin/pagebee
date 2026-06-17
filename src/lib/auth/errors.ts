/**
 * Auth/authorization error. Carries an HTTP status and a stable machine-readable `code` the API
 * returns as `{ error: code }`, so the frontend can branch (e.g. redirect to billing on
 * `subscription_inactive`). Lives in its own module so the policy layer and the session guards can
 * both import it without a circular dependency.
 *
 * Status codes: 401 unauthenticated · 402 payment/subscription required · 403 forbidden.
 */
export class AuthError extends Error {
  constructor(
    public status: 401 | 402 | 403,
    code?: string,
  ) {
    super(code ?? (status === 401 ? "unauthorized" : status === 402 ? "payment_required" : "forbidden"));
  }
}
