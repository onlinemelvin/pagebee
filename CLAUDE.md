# PageBee — CLAUDE.md

Guidance for Claude working in this repo. **PageBee** is a multi-tenant
shared-services platform for local businesses: every generated client website is a
thin frontend calling centralized platform APIs (leads, booking, chat, AI,
payments, invoices, statements), plus an internal ops platform (CRM, quotes,
subscriptions, employees, payroll, commissions, contracts, finances).

Start with these — they are the source of truth for design decisions:

| Doc | What it covers |
| --- | --- |
| [README.md](README.md) | Overview, core principles, stack |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Modules, ownership/multi-tenancy, payment ledger, request pipeline, hosting/domains |
| [docs/API.md](docs/API.md) | Versioned API contracts (public/client/admin/internal) |
| [docs/FEATURE_FLAGS.md](docs/FEATURE_FLAGS.md) | Plans, flags, plan→API allow-list, discount rules |
| [docs/ONBOARDING.md](docs/ONBOARDING.md) | **Official acquisition model**: Preview-before-you-pay, pricing, sales flow, monetization |
| [prisma/schema.prisma](prisma/schema.prisma) | Full data model (~55 models) |

**Project state:** design phase. Schema + docs exist; no application code, no
`package.json`, no git repo yet.

---

## Skills — [skills/](skills/)

Reusable guidance Claude should consult for the matching kind of work. Read the
relevant file before doing that work; don't reinvent conventions it already covers.

| Skill (file) | `name` | Use when… |
| --- | --- | --- |
| [skills/api-design.md](skills/api-design.md) | `api-design` | Designing/reviewing REST endpoints — resource naming, status codes, pagination, filtering, versioning, rate limiting. |
| [skills/backend-patterns.md](skills/backend-patterns.md) | `backend-patterns` | Server-side work — repository/service/controller layering, query optimization (N+1, indexing, pooling), caching, background jobs, middleware. |
| [skills/frontend-design.md](skills/frontend-design.md) | `frontend-design` | Building UI components/pages — distinctive, production-grade design that avoids generic AI aesthetics. |
| [skills/security.md](skills/security.md) | `owasp-security` | Reviewing for vulnerabilities, building auth/authz, handling user input — OWASP Top 10:2025, ASVS 5.0, agentic-AI security. |
| [skills/systematic-debugging.md](skills/systematic-debugging.md) | `systematic-debugging` | Any bug, test failure, or unexpected behavior — find root cause before proposing a fix. |
| [skills/code-review.md](skills/code-review.md) | `code-review` | Reviewing a PR before merge — dispatches parallel review agents (bugs, logic, CLAUDE.md compliance). |

Notes:
- The `name:` in a skill's frontmatter can differ from its filename —
  `skills/security.md` is `owasp-security`.
- `skills/code-review.md` shares a name with the built-in `/code-review` command;
  prefer this repo-local file's process when reviewing PageBee PRs.

---

## Hooks — [hooks/](hooks/)

Git hook scripts, **active**: the repo is wired with
`git config core.hooksPath hooks`, so git runs them automatically — **do not run
them by hand.** Git invokes hooks by exact name, so the two lifecycle hooks have
**no `.sh` extension** (`pre-commit`, `pre-push`); `pr-check.sh` keeps its
extension because it's a CI script, not a git event.

| Hook | Runs automatically | Does |
| --- | --- | --- |
| [hooks/pre-commit](hooks/pre-commit) | on every `git commit` | Type check, lint, **secrets scan**, block `.env` files, unit tests. |
| [hooks/pre-push](hooks/pre-push) | on every `git push` | Full test suite, build check. (Direct pushes to `main` are allowed — see Branching.) |
| [hooks/pr-check.sh](hooks/pr-check.sh) | in CI / before merge (invoke manually or from CI) | Full type check, lint (zero warnings), full + integration tests, TODO/FIXME scan, `npm audit`. |

Most heavy steps (`tsc`, ESLint, Vitest, `next build`, `npm audit`) are
**commented out** until the tooling exists (`tsconfig.json`, ESLint, Vitest,
`package.json`). Uncomment each block when its tool lands. The live checks today
are the secrets scan and the `.env` block.

**Branching (two-branch model):** only two long-lived branches —
**`main`** (the primary/release branch; GitHub default) and **`development`**.
All feature work and commits go to `development`; `main` is updated periodically
by merging `development` into it and pushing directly. Don't create other
long-lived branches.

**Secrets the pre-commit hook blocks:** `sk_live_`, `sk_test_`,
`SUPABASE_SERVICE_ROLE_KEY`, PEM private keys, `ghp_`, `xoxb-`, `AIza`. Keep all
secrets in environment variables; never commit `.env` (also covered by
[.gitignore](.gitignore)).

**Workflow:** commits and pushes trigger the hooks for free — just `git commit` /
`git push`. Before doing matching work, consult the relevant **skill** above
(e.g. read `owasp-security` before auth/input work, `systematic-debugging` before
fixing a bug). If a hook blocks an action, fix the cause — don't bypass with
`--no-verify`.

---

## Conventions (carried from the docs — keep these invariant)

- **Tenant isolation:** every client-owned query is scoped by `clientId` in the
  service layer; public routes derive `clientId` from the site token, never the body.
- **Feature flags, not plan names**, gate every capability.
- **Money is integer cents** everywhere.
- **No raw card/bank data** stored — only Stripe references; card entry uses Stripe
  Elements (Payment Element), keeping PCI scope at SAQ A. Payments use Stripe Connect
  **destination charges** with an application fee; PageBee never custodies funds.
  Connect modes: **Custom** accounts for the white-label "use ours" path (PageBee
  owns KYC + carries dispute/negative-balance liability — see
  [payments/onboarding.ts](src/lib/modules/payments/onboarding.ts)) and **Standard**
  via OAuth for "bring your own". Saved cards / Customers live on the **platform**
  (destination charges), never on the connected account. (Open item: the
  Custom-vs-Express liability trade-off needs Stripe-risk sign-off — keep docs+code
  in sync with the decision.)
- **Prisma 6** (the schema's `datasource` uses inline `url`/`directUrl`); pin
  `prisma`/`@prisma/client` to `^6` — Prisma 7 removed inline `url`.
- **Admin review required** before any generated client website is published.
- **Notifications:** every owner-relevant event raises an in-app notification (the
  topbar bell) and, when the owner has opted in, an email — both flow through one
  funnel. See **Notifications** below; wire one for every new owner-facing feature.

---

## Notifications — [src/lib/modules/notification/](src/lib/modules/notification/)

In-app (bell) + email, from one place. The in-app feed is the `NotificationEvent`
table (`channel = DASHBOARD`); email reuses the existing `toClient` funnel.

**When you add a feature that should alert the owner, do ONE of:**

1. **Has an owner email template?** Add it via `toClient()` in
   [email/notifications.ts](src/lib/modules/email/notifications.ts) as usual — you
   get the in-app notification **for free** (the funnel records it automatically)
   and the email is gated by the owner's opt-in. Add a row to `NOTIF_META` in
   [notification/meta.ts](src/lib/modules/notification/meta.ts) keyed by the
   template name so the bell shows the right icon/title/href/group.

2. **No email (in-app only), or firing from an event subscriber?** Call the
   primitive directly — it's fail-soft and tenant-scoped:
   ```ts
   import { createNotification } from "@/lib/modules/notification";
   await createNotification({ clientId, type: "lead.created", body: `New lead from ${name}` });
   ```
   Add the `type` to `NOTIF_META` (icon, href, `group`, level). Gate any matching
   owner email with `isGroupEmailAllowed(clientId, group)`.

Rules: in-app notifications are **always** recorded (the bell isn't gated); only
the **email copy** respects opt-in (`ClientSetting.emailSettings.notifications`,
default all-on). Critical mail (security, account, payment-failed) uses
`group: null` and always sends. Owners manage opt-ins at `/client/settings`.
