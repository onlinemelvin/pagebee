# PageBee

**PageBee** is a multi-tenant **shared-services platform** for local businesses.
Every generated client website is a thin frontend that calls centralized platform APIs (leads,
booking, chat, AI, payments, invoices, statements) — no business logic or data is
duplicated inside individual sites. The same platform runs our internal company
operations (CRM, quotes & discounts, subscriptions, employees, payroll,
commissions, contracts, finances).

> Design phase. This repo currently contains the data model and the architecture
> / API / feature-flag specifications. No application code yet.

## Documents

| File | What it covers |
| ---- | -------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, modular-monolith layout, ownership/multi-tenancy model, dual-purpose payment ledger, request/guard pipeline, RBAC, events, AI guardrails, website generation, security. |
| [docs/API.md](docs/API.md) | Versioned API contracts — `public` / `client` / `admin` / `internal` surfaces, auth models, plan gating, pricing-rule engine. |
| [docs/FEATURE_FLAGS.md](docs/FEATURE_FLAGS.md) | Plan definitions, canonical flag sets, plan→API allow-list, and the sales-rep discount guardrails. |
| [prisma/schema.prisma](prisma/schema.prisma) | Full PostgreSQL data model (~55 models) across all modules, multi-tenant by `clientId`. |

## Core principles

1. **Thin client websites** — they only call shared APIs; never store leads,
   payments, or business logic locally.
2. **Tenant isolation by `clientId`**, enforced in the service layer on every
   query (site token → tenant for public calls).
3. **Feature flags, not plan names**, gate every capability.
4. **Centralized payment ledger** — PageBee bills clients via Stripe Billing, and
   runs clients' customer invoicing via Stripe Connect (Express): clients just add a
   payout bank account, PageBee does all the invoicing and may take a cut. PageBee
   never custodies funds.
5. **AI constrained by data + human approval**, never by prompt alone.
6. **Admin review before any generated website is published.**

## Stack

Next.js + React + TypeScript · Tailwind + shadcn/ui · **Supabase** (Postgres +
Auth + Storage) + Prisma · **Vercel** hosting · Stripe Billing + Stripe Connect
(Express) · Resend · Twilio · OpenAI · jobs (Inngest/Trigger.dev) + Vercel
Cron · Sentry · PostHog.

Client sites are served from one Vercel project: Launch at
`{slug}.pagebee.com`; Connect/Automate may map a custom domain via the Vercel
Domains API.

## Next steps (not yet built)

Scaffold the Next.js monorepo and the module skeleton, then build the first
vertical slice (public marketing + pricing + lead capture → Lead API → Resend
notification). See ARCHITECTURE.md §11 for the MVP build order.
