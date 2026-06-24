<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into PageBee. Client-side tracking is initialized via `instrumentation-client.ts` with a reverse proxy through Next.js rewrites (so events survive ad blockers). A shared `posthog-server.ts` singleton provides server-side tracking via `posthog-node` across all API routes. User identification is wired on the client side (RegisterForm identifies the new user on successful signup) and on the server side (invite-accept and register use the user's email as distinctId). Error tracking is enabled globally via `capture_exceptions: true`.

| Event | Description | File |
|---|---|---|
| `plan_selected` | A prospective client selects a subscription plan during registration | `src/components/marketing/RegisterForm.tsx` |
| `client_registered` (client) | New client identified + registered event captured after successful sign-in | `src/components/marketing/RegisterForm.tsx` |
| `contact_form_submitted` | Visitor submits the marketing demo/contact form on the landing page | `src/components/marketing/ContactForm.tsx` |
| `client_registered` (server) | Server-side confirmation of new account creation | `src/app/api/v1/public/register/route.ts` |
| `lead_submitted` | Visitor submits a lead form on a client's published website | `src/app/api/v1/public/leads/route.ts` |
| `booking_created` | Visitor books an appointment on a client's published website | `src/app/api/v1/public/bookings/route.ts` |
| `billing_checkout_started` | Client initiates a Stripe Checkout session for setup or upgrade | `src/app/api/v1/client/billing/checkout/route.ts` |
| `subscription_upgraded` | Client upgrades subscription plan (instant apply only) | `src/app/api/v1/client/subscription/upgrade/route.ts` |
| `preview_approved` | Client approves their AI-generated website preview to begin launch | `src/app/api/v1/client/preview/approve/route.ts` |
| `payment_onboarding_submitted` | Client submits white-label payment processor onboarding | `src/app/api/v1/client/payments/onboarding/route.ts` |
| `website_update_published` | Admin approves and publishes an update to a live client website | `src/app/api/v1/admin/websites/[id]/approve/route.ts` |
| `team_invite_accepted` | Team member accepts an invitation to join a client account | `src/app/api/v1/invite/accept/route.ts` |
| `finance_document_created` | Client creates a finance document (invoice, estimate, or quote) | `src/app/api/v1/client/finance/documents/route.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics (wizard) — Dashboard](https://us.posthog.com/project/483635/dashboard/1753131)
- [Client acquisition funnel (wizard)](https://us.posthog.com/project/483635/insights/5ZiVfpZW) — plan_selected → registered → preview approved → checkout started
- [New registrations over time (wizard)](https://us.posthog.com/project/483635/insights/HbfUuK3D) — weekly signups
- [Client site leads & bookings (wizard)](https://us.posthog.com/project/483635/insights/U8KCrdgs) — volume of leads and bookings across all client sites
- [Subscription upgrades (wizard)](https://us.posthog.com/project/483635/insights/UqY4REAC) — monthly expansion revenue indicator
- [Finance documents created (wizard)](https://us.posthog.com/project/483635/insights/0cs0wSn8) — weekly invoice/estimate/quote activity

## Verify before merging

- [ ] Run a full production build (`npm run build`) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` to `.env.example` and any monorepo/bootstrap scripts so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or your bundler's upload step) into CI so production stack traces de-minify.
- [ ] Confirm the returning-visitor path also calls `identify` — the current implementation identifies on fresh registration, but a returning user who signs in again (via Supabase) should also call `posthog.identify()` so their sessions stay linked.

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-nextjs-app-router/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
