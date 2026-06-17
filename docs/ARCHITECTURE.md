# PageBee — Architecture

**PageBee** is a multi-tenant **shared-services platform** for local businesses.
Every generated client website is a thin frontend that calls centralized platform APIs — there is
no business logic, no lead storage, no payment logic duplicated inside individual
sites. This document explains the boundaries, the data-ownership model, the
request lifecycle, and the cross-cutting concerns that the rest of the codebase
must respect.

> If you only read one thing: **the tenant boundary (`clientId`) is enforced in
> the service layer on every query, and every generated website talks to the
> platform exclusively through the versioned APIs in [API.md](./API.md).**

---

## 1. Stack

Fixed per project decision — no substitutions.

| Concern            | Choice                                            |
| ------------------ | ------------------------------------------------- |
| Framework / SSR    | Next.js (App Router) + React + TypeScript         |
| Styling / UI       | Tailwind CSS + shadcn/ui                          |
| Backend            | Node.js / TypeScript (Next route handlers + services) |
| Database           | **Supabase Postgres** (pooled + direct via Prisma `directUrl`) |
| ORM                | Prisma                                             |
| Auth               | Role-based — Supabase Auth (or Auth.js) + our RBAC layer |
| Payments           | Stripe Billing (PageBee→clients) + Stripe Connect **Express** (clients→their customers, destination charges) |
| Email              | Resend                                             |
| SMS                | Twilio (or similar)                               |
| AI                 | Claude / Anthropic (`@anthropic-ai/sdk`)          |
| File / asset store | **Supabase Storage** (assets, contracts, receipts, statement PDFs) |
| Background jobs    | Inngest / Trigger.dev (serverless-native) + Vercel Cron |
| Errors             | Sentry                                             |
| Product analytics  | PostHog (or similar)                              |
| Hosting            | **Vercel** (app + edge middleware)                |

---

## 2. Macro shape: modular monolith

One deployable app, hard module boundaries inside it. We do **not** start with
microservices. Each module owns its tables, exposes a service layer, and is the
only code allowed to write its tables. Other modules call the service layer, not
each other's Prisma models directly.

```
app/
  (public)/            marketing site: home, pricing, signup, consult booking
  (admin)/             owner/admin dashboard + internal ops
  (employee)/          sales rep + support agent dashboards
  (client)/            client business owner dashboard
  api/v1/
    public/            called by generated client websites (site-token auth)
    client/            called by client dashboard (client-user session)
    admin/             called by admin dashboard (platform-admin session)
    internal/          service-to-service / jobs (internal secret)
lib/
  modules/
    tenant/  website/  lead/  customer/  booking/  chat/  ai/
    email/   sms/      payment/ invoice/ statement/ support/
    subscription/ employee/ payroll/ commission/ contract/
    analytics/ notification/ audit/
  auth/                session, RBAC, guards
  events/              event bus + handlers
  db/                  Prisma client singleton
prisma/
  schema.prisma
docs/
```

Each `lib/modules/<name>/` contains:

```
<name>/
  service.ts      business logic — the ONLY writer of this module's tables
  permissions.ts  which roles/flags may do what
  events.ts       events emitted + subscribed
  schema.ts       zod input/output validation
  index.ts        public surface (what other modules may import)
```

**Rule:** a module imports another module only through its `index.ts`. Reaching
into another module's `service.ts` internals or its Prisma models is forbidden —
that is how a modular monolith rots into a big ball of mud.

---

## 3. Ownership model (the core of multi-tenancy)

Four ownership levels. Every table maps to exactly one.

| Level        | Owner                       | Tenant key            | Examples                                            |
| ------------ | --------------------------- | --------------------- | --------------------------------------------------- |
| **Platform** | Our company                 | none (global)         | `employees`, `payroll_records`, `commission_records`, `vendor_invoices`, `company_expenses`, `prospects`, `quotes` |
| **Client**   | A local-business tenant     | `clientId`            | `leads`, `bookings`, `conversations`, `websites`, `customers`, `client invoices` |
| **Customer** | An end-customer of a client | `clientId` (+ `customerId`) | `customer_consents`, `customer_notes`, customer-facing invoices/statements |
| **Employee** | Our company internal ops    | none (global)         | `employee_contracts`, `pay_periods`                 |

Customer data is **always** `clientId`-scoped: a customer belongs to one client
business and is never shared across tenants.

### Tenant isolation enforcement

Isolation is enforced in the **service layer**, not left to callers:

1. Every request resolves an **auth context** (§5) that fixes `clientId` (or
   marks the caller as platform-scoped).
2. Service methods accept that context and inject `where: { clientId }` into
   every query. They never trust a `clientId` from the request body.
3. For `public/*` routes the `clientId` is derived from the **site token**, never
   from the payload — a website can only ever write to its own tenant.
4. `audit_logs` records the actor, the tenant context, and the action for every
   sensitive mutation.

(Postgres row-level security is a Phase-2 hardening layer on top of this, not a
substitute for service-layer checks.)

---

## 4. Money flow & the centralized payment ledger

PageBee runs **all** invoicing centrally and serves **two** distinct money flows.
This is the subtlest part of the design, so it is modeled explicitly via
`Invoice.kind`.

- **PLATFORM_BILLING** — PageBee billing a client business (setup fee + monthly
  subscription). Money flows to **PageBee**, via **Stripe Billing** on the
  `Subscription`. `Invoice.kind = PLATFORM_BILLING`, `customerId` null,
  `clientId` identifies the client being charged.
- **CLIENT_CUSTOMER** — a client business (Automate plan) billing its own end
  customer. Money flows to **the client**, but PageBee owns the entire invoicing
  experience and the ledger. `Invoice.kind = CLIENT_CUSTOMER`, `clientId` is the
  tenant's ledger, `customerId` is the end customer.

### How client→customer payments work: Stripe Connect (Express)

The client does **not** bring their own Stripe account, and PageBee does **not**
take raw bank details or custody funds itself (doing so would make PageBee a money
transmitter — see below). Instead:

1. **Onboarding.** The client completes Stripe-hosted **Express** onboarding once
   (bank account + light identity/KYC, a few minutes). To them it reads as
   "connect payouts to PageBee." We store only `Client.stripeConnectAccountId` and
   flip `Client.paymentsEnabled` when `charges_enabled && payouts_enabled`.
2. **Invoicing.** PageBee creates and sends every invoice / payment link centrally
   through the Payment service — our UX, our data, our reminders, our AI follow-ups.
3. **Collection.** When the customer pays, PageBee creates a **destination charge**
   on its platform Stripe account with `transfer_data.destination` set to the
   client's connected account. Stripe is merchant of record: it processes the card,
   handles compliance, and pays out to the client's bank.
4. **Monetization.** PageBee can take an `application_fee_amount` per transaction —
   a built-in revenue lever for the Automate plan.
5. **Compliance.** Stripe handles KYC/AML, payouts, refund/dispute plumbing, and
   1099-K issuance for connected accounts. PageBee never becomes a licensed money
   transmitter.

**Why not literally hold client bank accounts and move money ourselves?** Because
collecting a client's customers' funds and disbursing them = acting as a money
transmitter: ~47-state licensing, KYC/AML, bonding, and direct custody liability —
untenable for an early-stage startup and against processor terms. Connect Express
delivers the desired outcome (clients just add a bank, PageBee does all invoicing
and takes a cut) **without** that burden. If true fund-holding/escrow is ever
needed, the path is Connect **Custom + Treasury**, deliberately deferred.

All payment state lives centrally. A client website never holds its own payment
database — it calls the Payment API, which talks to Stripe; Stripe webhooks
(`payment_events`, deduped by `externalId`) update our ledger; the Statement
service derives financial statements from stored data; the AI service reads
ledger data to draft reminders.

---

## 5. Request lifecycle & the guard pipeline

Every API request passes the same gate before reaching a service method. Each API
must validate, in order:

1. **Who is calling** — resolve identity from session (dashboards), site token
   (public website), or internal secret (jobs).
2. **Which tenant** — bind `clientId` from the identity, never from the body.
3. **What role** — RBAC check against `permissions` for the action.
4. **Which features are enabled** — the client's plan + per-client overrides must
   permit the feature (see [FEATURE_FLAGS.md](./FEATURE_FLAGS.md)).
5. **Subscription active** — gated actions require a non-suspended subscription.
6. **Action allowed** — input validated (zod), business invariants checked.

Then: execute in a transaction → write `audit_log` → emit domain event → return.

```
request
  → resolveAuthContext()      // who + which tenant
  → requirePermission(key)    // RBAC
  → requireFeature(flag)      // plan gating
  → requireActiveSubscription // billing gating (where applicable)
  → validate(input)           // zod
  → service.method(ctx, dto)  // tenant-scoped business logic (tx)
  → audit.log()               // append-only trail
  → events.emit()             // fan-out to handlers
  → response
```

### Auth surfaces

| API surface     | Caller                       | Credential                  | Tenant binding             |
| --------------- | ---------------------------- | --------------------------- | -------------------------- |
| `/api/v1/public`   | generated client website  | **site token** (per site)   | token → `clientId`         |
| `/api/v1/client`   | client dashboard          | client-user session         | session → `clientId`       |
| `/api/v1/admin`    | admin dashboard           | platform-admin session      | platform-scoped (all)      |
| `/api/v1/internal` | jobs / service-to-service | internal shared secret      | explicit in call           |

---

## 6. Roles & RBAC

`User.type` splits PLATFORM vs CLIENT identities. Within that, `roles` +
`permissions` (string keys like `quote:approve`, `payroll:write`,
`invoice:void`) drive authorization. Representative roles:

- **Platform:** `ADMIN` (owner), `SALES_REP`, `SUPPORT_AGENT`, `EMPLOYEE`.
- **Client:** `CLIENT_OWNER`, `CLIENT_STAFF`.

Permission checks are centralized in each module's `permissions.ts`; route
handlers call `requirePermission()` — they never hand-roll role string
comparisons.

---

## 7. Event-driven workflows

Sensitive/business actions emit domain events; handlers fan out to
notifications, email, SMS, AI follow-ups, dashboard updates, audit, and
reporting. Events decouple "something happened" from "everyone who cares."

Canonical events:

```
lead.created          booking.created        invoice.created
invoice.sent          invoice.paid           invoice.overdue
payment.failed        support_ticket.created website.generated
website.published     subscription.payment_failed
employee.commission_earned   payroll.generated   contract.expiring
ai.escalation_required quote.created          quote.sent
quote.accepted        quote.needs_approval
```

Handlers are idempotent and run via the background-job runner so a slow email or
SMS send never blocks the request. Example: `invoice.paid` →
[receipt email, mark commission eligible, analytics conversion, audit log].

---

## 8. AI guardrails (enforced, not advisory)

The AI service is central and **constrained by data, not by prompt alone**:

- Answers only from the client's approved `AiKnowledgeBase`. No hallucinated
  services, prices, guarantees, licenses, or certifications.
- Never confirms an appointment unless the Booking API verifies availability.
- Never confirms a payment unless the Payment API confirms it via Stripe.
- Cannot issue refunds, change invoice amounts, alter payment terms, or grant
  discounts without **human approval** — modeled as `AiAction` rows that start
  `proposed` and require `approvedById` before execution.
- Never asks for or stores card data.
- Escalates on the triggers enumerated in `AiEscalationReason` (custom pricing,
  anger, legal/medical/financial questions, refund/discount requests, unknown
  facts, payment disputes, unverified payment claims, low confidence).
- Every AI message/action/usage is logged (`ai_messages`, `ai_actions`,
  `ai_usage_logs`) and respects feature flags + AI mode (suggestion / auto-reply
  / hybrid).

---

## 9. Website generation

Claude generates **structured website configuration** (theme, copy, pages,
sections, component list, plan-validated feature toggles, API wiring) — **not**
unrestricted production code. The output schema is the JSON contract in §16 of
the master spec, persisted across `Website → WebsiteVersion → WebsiteConfig /
WebsitePage`.

Pipeline: intake → `WebsiteGenerationJob` (QUEUED → GENERATING) → structured
config → **NEEDS_REVIEW** (admin review) → PUBLISHED. Versions support preview,
published, rollback, and regeneration. Generation validates that no feature
outside the client's plan is enabled and that no unsupported claim is made.

**Preview-first onboarding (the acquisition model).** Self-serve signups don't wait
in an admin queue — they get a **free AI website preview before paying** (banner +
`noindex` + demo-mode features + expiry), reusing this *same* generator and renderer.
Setup fee is charged only **after the customer approves**; the same `WebsiteVersion`
then launches and the monthly subscription starts. Preview lifecycle/status lives in
the `Preview` / `PreviewRevision` / `Conversion` models, kept separate from generation.
Full spec: [ONBOARDING.md](ONBOARDING.md). (The model: *Free AI Website Preview →
Approval → Setup Fee → Launch → Monthly Subscription*.)

---

## 10. Security & compliance baseline

- RBAC + service-layer tenant isolation + append-only `audit_logs`.
- Secrets encrypted at rest; API/site tokens are opaque and revocable.
- Stripe webhook signature validation; webhook idempotency via
  `payment_events.externalId`.
- **No raw card data** ever stored — only Stripe references (`PaymentMethod`
  keeps brand/last4/exp + Stripe id only).
- SMS consent stored per customer/channel (`customer_consents`) and verified
  before every send (`sms_logs.consentVerified`); email unsubscribe tracked.
- Payroll/tax: we track operational records and reports; actual filing/processing
  integrates a provider (Gusto/QuickBooks/ADP) later — we are not a payroll
  processor.

---

## 11. Hosting, domains & multi-tenant routing

PageBee deploys to **Vercel** (app + edge middleware) with **Supabase** for
Postgres, Auth, and Storage.

### Topology

- One Next.js project on Vercel. Host-based middleware decides what to render:
  - `pagebee.com` / `www` → marketing, pricing, signup.
  - `app.pagebee.com` → admin / employee / client dashboards.
  - `{slug}.pagebee.com` and custom domains → the published tenant website.
- **Supabase Postgres** via Prisma — pooled (PgBouncer, 6543) `DATABASE_URL` at
  runtime, direct (5432) `DIRECT_URL` for migrations. **Supabase Storage** for
  assets, contracts, receipts, statement PDFs. Supabase Auth (or Auth.js) backs
  the session layer; our RBAC sits on top.
- Background work: Inngest / Trigger.dev (serverless-native) for jobs and event
  handlers; Vercel Cron for scheduled reminders. (Vercel functions are
  short-lived, so long-running work lives in the job runner, never in a route.)

### Tenant routing & domains by tier

- **Subdomain (all tiers).** Every site is published at `{subdomain}.pagebee.com`
  via a wildcard `*.pagebee.com` domain on the Vercel project. Middleware reads the
  `Host` header, resolves the `Website` by `subdomain`, and renders the published
  version. This is the only web address for **Launch**.
- **Custom domain (Connect & Automate).** Higher tiers may map a custom domain
  (e.g. `acmecleaning.com`). Each connected host is a **`WebsiteDomain`** row
  (one-to-many off `Website`); a single connection provisions a **pair** — the apex
  (`acme.com`) and its `www` — one marked `isPrimary` (canonical), the other set to
  redirect to it. Flow (see `src/lib/modules/website/domain.ts`):
  1. The owner submits a domain in their website settings (gated by the
     `customDomain` feature flag). We expand it into the apex+www host pair and park
     both as `requested`. **Nothing touches Vercel yet** — an unvetted/typo'd/abusive
     domain is held for review.
  2. An admin **approves** it (same `website:review` permission as the draft queue).
     Only then does PageBee add each host to the Vercel project via the **Vercel
     Domains API** (the sibling as a 308 redirect to the primary), store the DNS
     records (A for apex / CNAME for www + any TXT challenge) on each row's
     `verification`, and flip them to `verifying`.
  3. The owner sets those DNS records at their registrar. A **cron**
     (`/api/v1/cron/domains/verify`, scheduled in `vercel.json`) sweeps `verifying`
     hosts, asks Vercel to verify, and flips each to `active` once DNS resolves (SSL
     is auto-issued). Per-host state runs `requested → verifying → active`
     (`error` on failure); reject/remove deletes the rows.
  Once the primary host is active, middleware resolves the tenant by custom domain
  too (any active host → its `Website`). When Vercel isn't configured
  (`VERCEL_TOKEN`/`VERCEL_PROJECT_ID` unset, e.g. local dev) the flow still records
  DNS records on approval but verification is manual.

The public API's `Origin` check (§5) validates against **both** the site's
`{subdomain}.pagebee.com` and any active custom domain.

---

## 12. Mapping to MVP

This schema + API surface covers the full vision, but the build order follows the
master spec's MVP scope (§31): scaffold → marketing+pricing+leads → CRM+quotes
(with discount rules & admin approval) → client management + subscriptions
(Stripe Billing) → website generation + preview + publish-review → Connect
booking → Automate (AI suggestion mode, payment links, invoices, Stripe Connect).
Internal ops (employees, commissions, basic payroll/contracts/expenses) land
alongside. Phase 2/3 (auto-reply AI, SMS workflows, statements, rollback,
payroll-provider integration) reuse the same models — nothing here needs to
change to get there.

See [FEATURE_FLAGS.md](./FEATURE_FLAGS.md) for plan gating and [API.md](./API.md)
for the endpoint contracts.
