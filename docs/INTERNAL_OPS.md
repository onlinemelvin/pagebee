# PageBee — Internal Ops Platform

The internal ops platform is the half of PageBee that **PageBee itself** runs on:
sales, CRM, contracts, commissions, employees/contractors, payroll, and company
finances. It is *not* tenant-facing — clients never see it.

**Current state (2026-06):** the data model is fully designed in
[prisma/schema.prisma](../prisma/schema.prisma) (~14 models), but **none of it is
built** — no service modules, no API routes, no UI. The client-facing product
(websites, leads, booking, chat, payments, invoices) is essentially complete; the
ops platform is the largest remaining gap.

This doc is the index + roadmap. Each sub-system links to its own design doc as it
lands. Phase 1 (the sales-rep program) is detailed in
[SALES_REP_PROGRAM.md](SALES_REP_PROGRAM.md).

---

## 1. The gap, precisely

| Sub-system | Schema models | Module | API | UI | Status |
| --- | --- | --- | --- | --- | --- |
| Sales / CRM | `Prospect`, `ProspectActivity`, `CallNote`, `FollowUp`, `SalesAssignment` | ✗ | ✗ | ✗ | **Not built** |
| Quotes | `Quote`, `QuoteLineItem`, `QuoteDiscount`, `QuoteApproval` | ✗ | ✗ | ✗ | **Not built** |
| Contracts | `Contract` | ✗ | ✗ | ✗ | **Not built** |
| Commissions | `CommissionPlan`, `CommissionRecord` | ✗ | ✗ | ✗ | **Not built** |
| Employees / contractors | `Employee` | ✗ | ✗ | ✗ | **Not built** |
| Payroll | `PayPeriod`, `PayrollRecord` | ✗ | ✗ | ✗ | **Not built** |
| Company finances | `VendorInvoice`, `CompanyInvoice`, `CompanyExpense` | ✗ | ✗ | ✗ | **Not built** |
| Internal docs / resources | `InternalDocument` | ✗ | ✗ | ✗ | **Not built** |

Everything below the client-facing product reuses primitives that already exist:
the `User`/auth layer, `AuditLog`, the notification funnel, object storage, and
Stripe. The ops platform mostly needs **new authz scopes** (a `rep` and an
`ops`/`admin` actor) and the service/API/UI layers on top of these tables.

---

## 2. Actors & access model

The platform today has two principal actor types: **client owners** (tenants) and
**admins**. The ops platform adds two more:

- **Ops/Admin** — PageBee staff. Full access to the ops platform (CRM, quotes,
  contracts, commissions, payroll, finances). Maps to `EmployeeType.ADMIN`.
- **Sales rep** — an external contractor (Upwork/Fiverr) with a **scoped** login.
  Maps to `EmployeeType.COMMISSION_REP`. A rep sees **only their own** assigned
  prospects, quotes, and earnings — never other reps', never the tenant dashboards,
  never company finances. This is a second isolation boundary analogous to tenant
  isolation: **every rep-scoped query is filtered by the rep's `Employee.id` in the
  service layer**, derived from the session, never from the request body.

Authz stays centralized in [src/lib/auth/policy.ts](../src/lib/auth/policy.ts)
(see the `authorization-policy` convention): the backend is the source of truth, and
rep scoping is enforced server-side regardless of what the UI shows.

---

## 3. Phased roadmap

Ordered by business value. We are **hiring contract sales reps now**, so Phase 1 is
the priority; the rest follow as headcount and revenue grow.

### Phase 1 — Sales-rep program (✅ BUILT)  → [SALES_REP_PROGRAM.md](SALES_REP_PROGRAM.md)
Onboard contract reps, get them productive, attribute and pay commissions. Delivered:
`Employee`(COMMISSION_REP) onboarding + e-signed `Contract`, the rep CRM portal
(prospects, activities, follow-ups, reminders), guardrailed `Quote`s, the resource
/ training hub, and conversion + commission tracking with clawback. Admins also get a
rep roster with provision/certify/delete.

### Phase 2 — Quote approval & discount governance (🟡 approval queue + onboarding link BUILT)
Admin approval queue for out-of-guardrail quotes (`QuoteApproval`) ✅ and the accepted
`Quote` → `Client` onboarding link (`convertQuoteToClient`) ✅. Still to add:
discount-impact / conversion analytics.

### Phase 3 — Commission settlement & payouts (✅ BUILT)
`CommissionRecord` settlement ledger: accrual + eligibility sweep, clawback,
**per-rep statements** (`/rep/earnings`), and the admin **settlement queue**
(`/admin/commissions`) — approve ELIGIBLE → APPROVED, then mark PAID with a payout
reference. Payout **rail is manual** by decision (Upwork/Fiverr milestones — see
SALES_REP_PROGRAM.md §11); no in-app money movement. (`PayrollRecord`/`PayPeriod`
integration deferred to Phase 4.)

### Phase 4 — Employees & payroll
Salaried/hourly internal staff, time, `PayPeriod`/`PayrollRecord`, and integration
references to an external payroll provider (Gusto/QuickBooks/ADP — `Employee.payrollRef`).

### Phase 5 — Company finances
`VendorInvoice` (Resend, Twilio, hosting, contractor bills), `CompanyExpense`,
`CompanyInvoice`, and a simple P&L / runway view. Lowest urgency; a spreadsheet
covers this until volume justifies it.

---

## 4. Known schema gaps to resolve before building

These surfaced while designing Phase 1. Fix as part of the relevant phase.

1. **`CommissionPlan` uses stale plan names.** Fields are `launchBase` /
   `connectBase` / `automateBase` (defaults 25/50/75) — the old LAUNCH/CONNECT/
   AUTOMATE names. Plans are now **Nectar / Honey / Hive**. Rename to
   `nectarBase` / `honeyBase` / `hiveBase` (and revisit the amounts — see the
   commission economics in [SALES_REP_PROGRAM.md](SALES_REP_PROGRAM.md#commission-economics)).
   Migration required.
2. **No payout rail.** `CommissionRecord` tracks what is *owed*; nothing models how a
   rep is *paid* (Stripe payout / Wise / PayPal / Upwork milestone) or stores their
   payout method + tax form reference (W-9 / W-8BEN). Add in Phase 3.
3. **No rep ↔ User link beyond `Employee.userId`.** Confirm the login/role wiring:
   a rep is a `User` with a rep role whose `Employee` row carries
   `employeeType = COMMISSION_REP`.
4. **Prospect dedup / assignment locking.** `SalesAssignment` is unique on
   `(prospectId, employeeId)` but nothing prevents two reps adding the *same business*
   as separate `Prospect` rows. Add a normalized-name/phone/email dedup + first-touch
   assignment lock (anti–lead-stealing). See abuse controls in the program doc.

---

## 5. Cross-cutting requirements (apply to every phase)

- **Audit everything sensitive.** Quote approvals, discount grants, commission
  approval/clawback, contract signature, payroll runs → `AuditLog`.
- **Money is integer cents.** (The schema's `Decimal(12,2)` ops-finance fields are the
  exception — internal accounting, not the tenant payment path; keep client-facing
  money in cents.)
- **Notifications.** Wire owner/admin/rep alerts through the notification funnel
  (new quote needs approval, commission became eligible, contract signed, follow-up
  due) per the CLAUDE.md Notifications rule.
- **Compliance is not optional** for outbound sales: TCPA (calls/SMS), CAN-SPAM
  (cold email), call-recording consent, and PII handling for prospect data. See
  [SALES_REP_PROGRAM.md §Compliance](SALES_REP_PROGRAM.md#compliance--legal-the-landmines).
