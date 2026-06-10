# PageBee — Onboarding & Monetization (Preview-Before-You-Pay)

This is the **official customer-acquisition and monetization model** for PageBee.
It supersedes the earlier "14-day live trial" idea.

> **Free AI Website Preview → Customer Approval → Setup Fee Payment → Website
> Launch → Monthly Subscription Starts**

The business **never charges the setup fee before the customer sees a preview.**

Related: [ARCHITECTURE.md](ARCHITECTURE.md) · [API.md](API.md) ·
[FEATURE_FLAGS.md](FEATURE_FLAGS.md) · [../prisma/schema.prisma](../prisma/schema.prisma)
(`Preview`, `PreviewRevision`, `Conversion`, `PreviewStatus`).

---

## 1. Positioning

Do **not** call this a "free trial." Position it as:

- **Free Website Preview**
- **Free AI Website Preview**
- **Preview Before You Pay**

The customer submits business info and receives a generated website **preview**
*before paying the setup fee*. The preview shows what their site could look like —
it is **not** a fully activated production website.

---

## 2. Customer Flow (self-serve)

1. Visitor lands on the public site.
2. Chooses a plan or clicks **"Get Free Preview."**
3. Fills out the business intake form.
4. System generates a preview using Claude + approved templates (shared generator).
5. Preview is hosted on a **temporary preview URL**.
6. Customer reviews the preview.
7. Customer may request **one minor revision** before payment.
8. Customer **approves** the preview.
9. Customer pays the **setup fee**.
10. Customer enters a payment method for the monthly subscription.
11. Website is finalized.
12. Website is connected to the customer's domain.
13. Plan-specific features are activated.
14. Website **goes live**.
15. **Monthly subscription begins** at launch (or after a short grace period — §7).

---

## 3. Pricing (official)

| Plan      | Setup fee | Monthly |
| --------- | --------- | ------- |
| Launch    | $399      | $39/mo  |
| Connect   | $699      | $89/mo  |
| Automate  | $999      | $179/mo |

Direct website customers pay **listed** pricing. Sales reps may offer **approved
discounts, mainly on setup fees**. Monthly-fee discounts require **admin approval**.
(All money stored as integer cents.)

---

## 4. Preview Rules

**The free preview INCLUDES:**
- Temporary preview URL
- AI-generated draft website
- Up to **3 preview pages**
- Sample design / content / layout
- Plan-aware sections
- **One** minor revision before payment

**The free preview does NOT include:**
- Custom domain connection · Google indexing · full launch · full export
- Unlimited revisions
- Full booking / chat / AI automation / payment / invoice / SMS activation
- Manual custom development · advanced SEO · ownership transfer

**The preview MUST have:**
- Preview banner
- `noindex`
- Expiration date
- Demo / disabled mode for restricted features
- Limited form functionality
- Demo mode for payments and AI if shown

---

## 5. Preview Expiration

- Preview expires after **14 days** (`Preview.expiresAt`, default = generatedAt + 14d).
- Sales reps may **extend once**; further extensions need **admin approval**.
- The system **notifies the customer before expiration**.

---

## 6. Payment Rules

- **No card** required for the first free preview.
- A payment method is required **before** any of: removing the preview banner,
  connecting a custom domain, publishing live, or activating booking / chat / AI /
  payments / invoices / SMS, or starting the monthly subscription.
- **Setup fee is charged only after the customer approves the preview and wants to
  launch.**
- **Monthly subscription starts after launch** (see grace period below).

---

## 7. Grace Period

If the customer delays launch after paying the setup fee (missing content, domain
access, or approval delays):

- Monthly billing starts **at launch**, or
- **7 days after setup-fee payment**, whichever comes first.

---

## 8. Plan-Specific Preview Experience

### Launch — preview shows
Home · Services/About · Contact · contact form in **demo mode** · basic SEO preview ·
basic local-business layout.
**After payment, activate:** full 5-page site · hosting · SSL · contact form · basic
SEO · maintenance.

### Connect — preview shows
Everything in Launch + sample booking section · sample chat widget · quote-request
section · lead-capture experience (all demo).
**After payment, activate:** booking system · chat widget · lead inbox · email
notifications · SMS alerts (plan limits) · calendar config.

### Automate — preview shows
Everything in Launch + Connect + sample AI-assistant demo · sample payment section ·
sample invoice/payment page · follow-up automation explanation (all demo).
**After payment, activate:** AI knowledge base · AI assistant · AI follow-ups · Stripe
Connect · payment links · invoices · statements · paid bookings/deposits · payment
reminders.

---

## 9. Sales Rep Flow

1. Rep adds prospect to CRM (`Prospect`).
2. Rep contacts prospect.
3. Rep offers a free website preview.
4. Prospect provides business info.
5. Rep or system creates the preview.
6. Rep sends the preview link.
7. Prospect reviews.
8. Rep follows up (`FollowUp`).
9. Prospect approves.
10. Rep sends quote / payment link (`Quote`).
11. Prospect pays setup fee.
12. Prospect becomes a client (`Conversion`, `Prospect.convertedClient`).
13. Website launches.
14. Monthly subscription starts.

**Rep script:** "We don't ask you to pay the setup fee before seeing anything. We'll
create a free preview of your new website first. If you like the direction, then we
collect the setup fee, connect your domain, activate your features, and launch the site."

---

## 10. Discount Rules (rep guardrails)

Direct customers pay published pricing. Reps offer approved discounts through `Quote`s,
**preferring setup-fee discounts** over monthly discounts. Monthly discounts require
**admin approval**. All discounts are tracked in the quote system.

| Plan     | Listed                 | Sales-rep minimum (no admin) |
| -------- | ---------------------- | ---------------------------- |
| Launch   | $399 setup + $39/mo    | **$299** setup + $39/mo      |
| Connect  | $699 setup + $89/mo    | **$599** setup + $89/mo      |
| Automate | $999 setup + $179/mo   | **$899** setup + $179/mo     |

Anything below these (or any monthly discount) requires **admin approval**
(`Quote.requiresApproval`). See [FEATURE_FLAGS.md](FEATURE_FLAGS.md#discount-rules).

---

## 11. Monetization — four layers

1. **Setup fees** — onboarding/launch: Launch $399 · Connect $699 · Automate $999.
2. **Monthly subscriptions** — recurring: $39 · $89 · $179.
3. **Add-ons** — extra page, extra update, rush launch, logo refresh, Google Business
   Profile setup, local SEO, blog posts, review management, additional location,
   custom form, custom integration.
4. **Usage-based fees** (margin protection) — extra AI replies, extra SMS, extra
   invoices, extra storage, extra automation workflows.

---

## 12. Public Website Copy

- "Preview before you pay."
- "Tell us about your business and we'll create a free website preview. If you love
  it, we'll launch it with hosting, support, and your selected monthly plan."
- "No setup fee required to see your preview. Setup fee is only charged when you
  approve and launch."
- "Built, hosted, maintained, and supported for you — without the expensive agency bill."

---

## 13. Preview Statuses

`PreviewStatus` (see schema): `INTAKE_STARTED` · `INTAKE_COMPLETED` ·
`PREVIEW_GENERATING` · `PREVIEW_READY` · `PREVIEW_SENT` · `PREVIEW_VIEWED` ·
`REVISION_REQUESTED` · `REVISION_COMPLETED` · `APPROVED` · `SETUP_FEE_PENDING` ·
`SETUP_FEE_PAID` · `LAUNCH_IN_PROGRESS` · `LIVE` · `EXPIRED` · `LOST`.

---

## 14. Data Model

See [../prisma/schema.prisma](../prisma/schema.prisma):

- **`Preview`** — `prospectId?`, `clientId?`, `websiteId?`, `selectedPlan`, `status`,
  `previewUrl`, `expiresAt`, `generatedAt`, `sentAt`, `viewedAt`, `approvedAt`,
  `revisionCount`, `maxFreeRevisions`, `createdById`, `assignedSalesRepId`, `notes`.
- **`PreviewRevision`** — `previewId`, `requestedBy`, `requestText`, `status`,
  `completedAt`.
- **`Conversion`** — `previewId`, `prospectId?`, `clientId`, `selectedPlan`,
  `setupFeeAmount`, `monthlyAmount`, `discountAmount`, `setupFeePaidAt`,
  `subscriptionStartedAt`, `convertedById`.

---

## 15. API Surface

See [API.md](API.md#preview--onboarding).

```text
# Public (self-serve)
POST /api/v1/public/previews/intake
POST /api/v1/public/previews/{previewId}/viewed
POST /api/v1/public/previews/{previewId}/request-revision
POST /api/v1/public/previews/{previewId}/approve

# Admin
GET  /api/v1/admin/previews
GET  /api/v1/admin/previews/{previewId}
POST /api/v1/admin/previews/{previewId}/generate
POST /api/v1/admin/previews/{previewId}/send
POST /api/v1/admin/previews/{previewId}/extend
POST /api/v1/admin/previews/{previewId}/convert

# Sales
GET  /api/v1/sales/previews
POST /api/v1/sales/previews/{previewId}/send
POST /api/v1/sales/previews/{previewId}/follow-up
POST /api/v1/sales/previews/{previewId}/create-quote
```

---

## 16. Analytics

Track: preview requests · generation success rate · viewed rate · approval rate ·
preview→paid conversion rate · avg time intake→preview · avg time sent→approval ·
avg time setup-fee-paid→launch · lost previews · expired previews · conversion by
plan · conversion by sales rep · discount impact on conversion · setup-fee revenue ·
MRR started from previews.

---

## 17. Architecture Rule (critical)

The free preview **reuses the same shared website generation system and shared
services** — do **not** build a separate throwaway preview system.

- Generate the config through the normal **Website Configuration Service** /
  generation pipeline.
- Store **preview status separately** (`Preview` model).
- Render the preview with the **same website renderer** (`src/lib/site/serve.ts`).
- **Disable production-only features** until payment (feature flags + preview mode).
- Convert the preview into the live website **after payment** (flip preview mode off,
  publish the same `WebsiteVersion`, activate plan features, start subscription).

---

## 18. Implementation Status (2026-06-09)

Spec + data model are in place; the **flow is implemented in the Stripe/preview phase**
(payment is the gating dependency). Deltas from current code:

- **Today (interim):** real signups create a `Subscription(status=TRIAL)` and the
  generated site **auto-publishes live** (no preview mode yet). `sweepTrials()` pauses
  the site at day 14. This is a stopgap — it does *not* match this spec.
- **To build (preview phase):**
  1. Replace signup-creates-live-trial with **signup-creates-`Preview`** (status flow
     above); render in **preview mode** — banner + `noindex` + demo features +
     `expiresAt` — served by the existing renderer.
  2. Enforce **one free revision**, expiration + reminders, sales/admin extension.
  3. On **approval → setup-fee payment** (Stripe) → create `Conversion`, **launch**
     (publish version, activate plan features, connect domain), **start subscription**
     (with the §7 grace period).
  4. Public/admin/sales preview APIs (§15) + analytics (§16).
  5. Retire `Subscription.trialEndsAt` auto-takedown in favor of preview expiry.
