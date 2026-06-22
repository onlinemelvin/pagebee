# API Contracts (v1)

Versioned, shared platform APIs. Four surfaces, four auth models (see
[ARCHITECTURE.md §5](./ARCHITECTURE.md)):

| Prefix             | Caller                    | Auth               | Tenant binding        |
| ------------------ | ------------------------- | ------------------ | --------------------- |
| `/api/v1/public`   | generated client websites | site token         | token → `clientId`    |
| `/api/v1/client`   | client dashboard          | client-user session| session → `clientId`  |
| `/api/v1/admin`    | admin dashboard           | platform-admin     | all tenants           |
| `/api/v1/internal` | jobs / service-to-service | internal secret    | explicit              |

**Conventions**

- All bodies are JSON. Money is in **integer cents**. Timestamps are ISO-8601 UTC.
- Every request runs the guard pipeline: identity → tenant → role → feature flag
  → subscription → validation. A blocked feature returns `403 feature_not_enabled`.
- Standard errors: `400 validation_error`, `401 unauthorized`,
  `403 forbidden` / `feature_not_enabled`, `404 not_found`,
  `409 conflict`, `422 business_rule_violation`, `429 rate_limited`.
- Public routes are rate-limited per site token and validate `Origin` against the
  site's registered domain.

---

## Public API — called by generated client websites

Auth: `Authorization: Bearer <siteToken>`. The token resolves the `clientId`;
the website can never address another tenant. Availability of each endpoint is
gated by the client's plan (see [FEATURE_FLAGS.md](./FEATURE_FLAGS.md)).

| Method | Path                                       | Plan      | Purpose                                  |
| ------ | ------------------------------------------ | --------- | ---------------------------------------- |
| GET    | `/api/v1/public/site-config`               | all       | Theme, copy, pages, enabled features for render |
| POST   | `/api/v1/public/leads`                     | all       | Submit contact / quote / service inquiry |
| POST   | `/api/v1/public/analytics/events`          | all       | Record a website/conversion event        |
| GET    | `/api/v1/public/booking/availability`      | Honey+    | Open slots for a bookable service        |
| POST   | `/api/v1/public/bookings`                  | Honey+    | Create an appointment request            |
| POST   | `/api/v1/public/chat/conversations`        | Honey+    | Start a conversation                      |
| POST   | `/api/v1/public/chat/messages`             | Honey+    | Post a customer message                   |
| POST   | `/api/v1/public/ai/reply`                  | Hive      | Get an AI reply (mode-gated; may escalate)|
| POST   | `/api/v1/public/payments/payment-link`     | Hive      | Create a Stripe payment link             |
| GET    | `/api/v1/public/invoices/{invoiceId}`      | Hive      | Fetch an invoice for the pay page         |
| GET    | `/api/v1/public/statements/{customerId}`   | Hive      | Customer statement (portal)               |

Plan gating is hard: a Nectar site calling `/bookings` gets
`403 feature_not_enabled`. See per-plan allow-lists in §17 of the master spec.

### `POST /api/v1/public/leads`

```jsonc
// request
{
  "type": "CONTACT_FORM",        // CONTACT_FORM | QUOTE_REQUEST | SERVICE_INQUIRY
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "+15551234567",
  "message": "Need a quote for weekly cleaning.",
  "source": "/contact",
  "payload": { "preferredTime": "mornings" }
}
// 201
{ "id": "lead_...", "status": "NEW", "createdAt": "2026-06-07T18:00:00Z" }
```

Side effects: persists `Lead` (clientId from token) → emits `lead.created` →
owner email/SMS alert (per plan/consent) → optional AI follow-up (Hive).

---

## Preview / Onboarding

The "Preview before you pay" acquisition flow (full spec:
[ONBOARDING.md](ONBOARDING.md)). Previews reuse the shared generator + renderer in
preview mode (banner, `noindex`, demo features) until the setup fee is paid.

Public (self-serve — no card required for the preview):

| Method | Path                                              | Purpose                          |
| ------ | ------------------------------------------------- | -------------------------------- |
| POST   | `/api/v1/public/previews/intake`                  | Submit business info → start preview |
| POST   | `/api/v1/public/previews/{previewId}/viewed`      | Mark preview viewed              |
| POST   | `/api/v1/public/previews/{previewId}/request-revision` | Request the one free revision |
| POST   | `/api/v1/public/previews/{previewId}/approve`     | Approve → setup-fee payment      |

Admin:

| Method | Path                                          | Purpose                         |
| ------ | --------------------------------------------- | ------------------------------- |
| GET    | `/api/v1/admin/previews`                      | List/filter previews            |
| GET    | `/api/v1/admin/previews/{previewId}`          | Preview detail                  |
| POST   | `/api/v1/admin/previews/{previewId}/generate` | (Re)generate the preview        |
| POST   | `/api/v1/admin/previews/{previewId}/send`     | Send the preview link           |
| POST   | `/api/v1/admin/previews/{previewId}/extend`   | Extend expiry (admin)           |
| POST   | `/api/v1/admin/previews/{previewId}/convert`  | Manual convert → client/launch  |

Sales:

| Method | Path                                              | Purpose                       |
| ------ | ------------------------------------------------- | ----------------------------- |
| GET    | `/api/v1/sales/previews`                          | Rep's previews                |
| POST   | `/api/v1/sales/previews/{previewId}/send`         | Send preview link to prospect |
| POST   | `/api/v1/sales/previews/{previewId}/follow-up`    | Log/schedule a follow-up      |
| POST   | `/api/v1/sales/previews/{previewId}/create-quote` | Quote / payment link          |

---

## Client API — called by the client business dashboard

Auth: client-user session; `clientId` from session.

| Method | Path                                  | Purpose                              |
| ------ | ------------------------------------- | ------------------------------------ |
| GET    | `/api/v1/client/overview`             | Dashboard KPIs (leads, bookings, usage) |
| GET    | `/api/v1/client/leads`                | List/filter leads                    |
| PATCH  | `/api/v1/client/leads/{id}`           | Update lead status / assignment      |
| GET    | `/api/v1/client/bookings`             | List bookings                        |
| PATCH  | `/api/v1/client/bookings/{id}`        | Confirm / cancel / reschedule        |
| GET    | `/api/v1/client/conversations`        | Inbox                                |
| POST   | `/api/v1/client/conversations/{id}/messages` | Reply (or approve AI draft)   |
| GET    | `/api/v1/client/customers`            | CRM list                             |
| GET    | `/api/v1/client/invoices`             | List invoices (Hive)                 |
| POST   | `/api/v1/client/invoices`             | Create invoice (Hive)                |
| POST   | `/api/v1/client/invoices/{id}/send`   | Email invoice (Hive)                 |
| GET    | `/api/v1/client/payments`             | Payment history (Hive)               |
| GET    | `/api/v1/client/statements`           | Statements (Hive)                    |
| GET    | `/api/v1/client/website`              | Website status + content             |
| POST   | `/api/v1/client/website/change-request` | Request a content change           |
| GET    | `/api/v1/client/usage`                | Usage vs plan limits (SMS, AI, invoices) |
| GET    | `/api/v1/client/subscription`         | Plan, status, billing portal link    |
| GET    | `/api/v1/client/support/tickets`      | Support tickets                      |
| POST   | `/api/v1/client/support/tickets`      | Open a ticket                        |

---

## Admin API — called by the owner/admin dashboard

Auth: platform-admin session; all tenants visible.

### Clients, subscriptions, websites

| Method | Path                                       | Purpose                         |
| ------ | ------------------------------------------ | ------------------------------- |
| GET    | `/api/v1/admin/overview`                   | MRR, setup revenue, churn, queues |
| GET/POST | `/api/v1/admin/clients`                  | List / create clients           |
| GET/PATCH | `/api/v1/admin/clients/{id}`            | Inspect / edit a client         |
| GET    | `/api/v1/admin/subscriptions`              | Subscription states             |
| POST   | `/api/v1/admin/clients/{id}/feature-flags` | Per-client flag overrides       |
| POST   | `/api/v1/admin/websites/{id}/generate`     | Kick off generation job         |
| GET    | `/api/v1/admin/websites/{id}/preview`      | Preview a version               |
| POST   | `/api/v1/admin/websites/{id}/review`       | Approve generated config        |
| POST   | `/api/v1/admin/websites/{id}/publish`      | Publish a reviewed version      |
| POST   | `/api/v1/admin/websites/{id}/rollback`     | Roll back to a prior version    |

### Sales, quotes & approvals

| Method | Path                                   | Purpose                              |
| ------ | -------------------------------------- | ------------------------------------ |
| GET/POST | `/api/v1/admin/prospects`            | CRM prospects                        |
| GET/POST | `/api/v1/admin/quotes`               | List / create quotes                 |
| POST   | `/api/v1/admin/quotes/{id}/submit`     | Run pricing rules; send or flag      |
| GET    | `/api/v1/admin/quotes/approval-queue`  | Quotes needing approval              |
| POST   | `/api/v1/admin/quotes/{id}/approve`    | Approve (admin)                      |
| POST   | `/api/v1/admin/quotes/{id}/reject`     | Reject (admin)                       |
| POST   | `/api/v1/admin/quotes/{id}/convert`    | Accepted → client + subscription     |

### Internal operations

| Method | Path                                        | Purpose                       |
| ------ | ------------------------------------------- | ----------------------------- |
| GET/POST | `/api/v1/admin/employees`                 | Employee records              |
| GET    | `/api/v1/admin/payroll/periods`             | Pay periods                   |
| POST   | `/api/v1/admin/payroll/periods/{id}/generate` | Generate payroll records    |
| POST   | `/api/v1/admin/payroll/records/{id}/approve` | Approve a paycheck record    |
| GET    | `/api/v1/admin/commissions`                 | Commission records           |
| POST   | `/api/v1/admin/commissions/{id}/approve`    | Approve commission           |
| POST   | `/api/v1/admin/commissions/{id}/clawback`   | Clawback (cancel/refund)      |
| GET/POST | `/api/v1/admin/contracts`                 | Contracts                     |
| GET/POST | `/api/v1/admin/company-invoices`          | Company-issued invoices       |
| GET/POST | `/api/v1/admin/vendor-invoices`           | Vendor bills                  |
| GET/POST | `/api/v1/admin/expenses`                  | Company expenses              |

### Quote submit — pricing-rule engine

`POST /api/v1/admin/quotes/{id}/submit` runs the discount guardrails
([FEATURE_FLAGS.md](./FEATURE_FLAGS.md) §Discount rules):

```jsonc
// 200 — within rep limits
{ "status": "APPROVED", "canSend": true, "requiresApproval": false }
// 200 — outside limits (e.g. monthly discount, or setup below rep minimum)
{
  "status": "NEEDS_APPROVAL",
  "canSend": false,
  "requiresApproval": true,
  "violations": ["monthly_fee_discount_requires_admin", "setup_below_rep_minimum"]
}
```

---

## Internal API — jobs & service-to-service

Auth: internal shared secret. Not exposed publicly.

| Method | Path                                | Purpose                                  |
| ------ | ----------------------------------- | ---------------------------------------- |
| POST   | `/api/v1/internal/webhooks/stripe`  | Stripe webhook (signature-verified, idempotent via `payment_events.externalId`) |
| POST   | `/api/v1/internal/webhooks/resend`  | Email delivery status                    |
| POST   | `/api/v1/internal/webhooks/twilio`  | SMS delivery status                      |
| POST   | `/api/v1/internal/jobs/website-generate` | Worker: run a generation job        |
| POST   | `/api/v1/internal/jobs/reminders`   | Worker: invoice/appointment reminders    |
| POST   | `/api/v1/internal/events/dispatch`  | Event-bus fan-out entrypoint             |

---

## Cross-cutting

- **Idempotency:** mutating public/internal endpoints accept an
  `Idempotency-Key` header; Stripe events dedupe on their event id.
- **Pagination:** list endpoints take `?cursor=&limit=` (cursor-based).
- **Audit:** every mutation writes an `audit_log` with actor + tenant + action.
- **Feature/limit enforcement:** usage-metered endpoints (SMS, AI replies,
  invoices) check the client's monthly allowance before acting and return
  `429 usage_limit_reached` when exceeded.
