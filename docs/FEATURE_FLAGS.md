# Feature Flags & Plan Gating

Plans are the unit of monetization; **feature flags are the unit of enforcement.**
Every gated capability — in the API guard pipeline, the dashboards, and generated
websites — checks a flag, never a plan name directly. This lets per-client
overrides (add-ons, custom deals) layer cleanly on top of the canonical plan set.

## Resolution order

A client's effective flags are computed as:

```
effectiveFlags = planDefaults(subscription.plan)   // canonical, from `plans.featureFlags`
                 ⊕ clientOverrides(feature_flags)   // per-client add-ons / custom deals
```

Overrides live in the `feature_flags` table (`clientId`, `key`, `enabled`,
`value`) and win over plan defaults. Numeric limits (SMS, AI, invoices) carry a
`value`. The resolved set is what `requireFeature(key)` and `requireWithinLimit(key)`
check on every request.

## Enforcement points

1. **API guard** — `requireFeature()` returns `403 feature_not_enabled` when off;
   `requireWithinLimit()` returns `429 usage_limit_reached` when a monthly
   allowance is exhausted.
2. **Generated website** — the generator only wires components/API integrations
   whose flags are on; the config's `safetyChecks.planFeaturesValidated` must pass
   before publish.
3. **Dashboards** — UI hides/locks features that are off, but the server is the
   source of truth (UI gating is convenience, not security).

## Three plans

Prices in dollars below; stored in **cents** in `plans` (`setupFee`,
`monthlyFee`). Setup fee is one-time; monthly fee recurs.

| Capability              | Launch | Connect | Automate |
| ----------------------- | :----: | :-----: | :------: |
| Setup fee               | $399   | $699    | $999     |
| Monthly fee             | $39    | $89     | $179     |
| Max pages               | 5      | 8       | 12       |
| Minor updates / month   | 1      | 3       | 5        |
| Contact form            | ✅     | ✅      | ✅       |
| Hosting + SSL           | ✅     | ✅      | ✅       |
| Subdomain ({slug}.pagebee.com) | ✅ | ✅ | ✅       |
| Custom domain           | ❌     | ✅      | ✅       |
| Basic analytics         | ✅     | ✅      | ✅       |
| Booking                 | ❌     | ✅      | ✅       |
| Website chat            | ❌     | ✅      | ✅       |
| SMS alerts              | ❌     | ✅ (50/mo) | ✅ (100/mo) |
| AI assistant            | ❌     | ❌      | ✅ (100 replies/mo) |
| AI follow-ups / scoring / summaries | ❌ | ❌ | ✅       |
| Payments / payment links| ❌     | ❌      | ✅       |
| Invoices                | ❌     | ❌      | ✅ (25/mo) |
| Statements / payment portal | ❌ | ❌      | ✅       |
| Paid bookings / deposits| ❌     | ❌      | ✅       |
| AI invoice follow-ups   | ❌     | ❌      | ✅       |

### Canonical flag sets

Stored verbatim in `plans.featureFlags` (JSON). These are the source of truth the
generator and API gating read.

```json
// LAUNCH
{
  "planName": "Launch",
  "setupFee": 399, "monthlyFee": 39, "maxPages": 5, "monthlyUpdates": 1,
  "contactForm": true, "basicAnalytics": true, "hosting": true, "ssl": true,
  "customDomain": false,
  "booking": false, "chat": false, "smsAlerts": false,
  "payments": false, "invoices": false, "statements": false,
  "paymentReminders": false, "aiAssistant": false, "aiFollowUps": false
}
```

```json
// CONNECT
{
  "planName": "Connect",
  "setupFee": 699, "monthlyFee": 89, "maxPages": 8, "monthlyUpdates": 3,
  "contactForm": true, "basicAnalytics": true, "hosting": true, "ssl": true,
  "customDomain": true,
  "booking": true, "chat": true, "smsAlerts": true, "smsIncludedMonthly": 50,
  "payments": false, "invoices": false, "statements": false,
  "paymentReminders": false, "aiAssistant": false, "aiFollowUps": false
}
```

```json
// AUTOMATE
{
  "planName": "Automate",
  "setupFee": 999, "monthlyFee": 179, "maxPages": 12, "monthlyUpdates": 5,
  "contactForm": true, "basicAnalytics": true, "hosting": true, "ssl": true,
  "customDomain": true,
  "booking": true, "chat": true, "smsAlerts": true, "smsIncludedMonthly": 100,
  "payments": true, "invoices": true, "statements": true, "paymentLinks": true,
  "paidBookings": true, "paymentReminders": true, "customerPaymentPortal": true,
  "aiAssistant": true, "aiFollowUps": true, "aiLeadScoring": true,
  "aiSummaries": true, "aiInvoiceFollowUps": true,
  "aiRepliesIncludedMonthly": 100, "invoicesIncludedMonthly": 25
}
```

> **Payments (Automate):** processed through PageBee-managed **Stripe Connect
> Express** — clients add a payout bank account once, PageBee does all invoicing
> and may take an application fee. PageBee does not custody funds. See
> [ARCHITECTURE.md §4](./ARCHITECTURE.md).

## Plan → API allow-list

Generated websites may only call the APIs their plan permits ([API.md](./API.md)
Public surface, master spec §17).

| API integration   | Launch | Connect | Automate |
| ----------------- | :----: | :-----: | :------: |
| Tenant / site-config | ✅  | ✅      | ✅       |
| Lead              | ✅     | ✅      | ✅       |
| Analytics         | ✅     | ✅      | ✅       |
| Email             | ✅     | ✅      | ✅       |
| Booking           | ❌     | ✅      | ✅       |
| Chat              | ❌     | ✅      | ✅       |
| SMS               | ❌     | ✅      | ✅       |
| AI                | ❌     | ❌      | ✅       |
| Payment           | ❌     | ❌      | ✅       |
| Invoice           | ❌     | ❌      | ✅       |
| Statement         | ❌     | ❌      | ✅       |

---

## Preview mode (before payment)

In the "Preview before you pay" flow ([ONBOARDING.md](ONBOARDING.md)), a site is
generated and rendered in **preview mode** until the setup fee is paid. Preview mode
is a gate layered *on top of* plan flags: even if a plan enables a capability, it is
shown in **demo/disabled** mode (no real delivery) until launch. Specifically, while
`Preview.status` is pre-`SETUP_FEE_PAID`:

- Banner shown + `noindex`; no custom domain; not in sitemaps; expires (`expiresAt`).
- Booking / chat / AI / payments / invoices / SMS render as **demo** only.
- Forms have limited functionality; up to 3 preview pages; one free revision.

On setup-fee payment the same `WebsiteVersion` **launches** (preview mode off, plan
features activated), and the monthly subscription starts (see ONBOARDING §6–§8).

## Discount guardrails (sales-rep pricing rules)

Full acquisition/onboarding model: [ONBOARDING.md](ONBOARDING.md).


Direct customers pay list price. Sales reps may discount within limits; anything
beyond requires admin approval. The quote pricing engine
(`POST /api/v1/admin/quotes/{id}/submit`) enforces this and flags violations.

### Minimum allowed pricing (rep, no approval)

| Plan     | List setup | List monthly | Rep min setup | Monthly discount |
| -------- | ---------- | ------------ | ------------- | ---------------- |
| Launch   | $399       | $39          | $299          | admin only       |
| Connect  | $699       | $89          | $599          | admin only       |
| Automate | $999       | $179         | $899          | admin only       |

### Reps may offer without approval

Setup discount down to the rep minimum; first month free; one extra page; one
extra monthly update for the first 3 months; free simple migration; free
consultation; free Google Business Profile review.

### Requires admin approval

**Any** monthly-fee discount; setup below rep minimum; waived setup; more than one
free month; more than one extra page; more than three extra monthly updates;
custom integrations; heavy AI/SMS usage; multi-location; >12 pages; custom payment
workflows; any deal that materially reduces margin.

### Reps may never offer

Unlimited updates / AI / SMS; free payment processing; guaranteed ranking or
leads; lifetime discounts; custom software in standard plans; legal/tax/medical/
financial advice from AI; untracked discounts outside the quote system.

### Engine rules (pseudocode)

```
requiresApproval =
     offeredMonthlyFee < listedMonthlyFee            // any monthly discount
  || offeredSetupFee   < repMinSetup[plan]           // below rep floor
  || freeMonths        > 1
  || extraPages        > 1
  || extraUpdates      > 3
  || hasCustomIntegration || isMultiLocation || pages > 12
```

If `requiresApproval`, the quote moves to `NEEDS_APPROVAL` and cannot be sent
until an admin approves. Every discount is recorded (`quote_discounts`) and
commissions are computed from **actually collected revenue**, never list price.
