# PageBee — Sales-Rep Program (Phase 1 of Internal Ops)

How PageBee recruits, contracts, equips, tracks, and pays **commission-based
contract sales reps** (hired via Upwork/Fiverr or direct). This is Phase 1 of the
[Internal Ops Platform](INTERNAL_OPS.md).

> **Read the contract template alongside this:**
> [contracts/sales-rep-commission-agreement.md](contracts/sales-rep-commission-agreement.md)

The schema already models this end-to-end: `Employee`(COMMISSION_REP), `Contract`
(SALES_REP_COMMISSION), `Prospect` / `SalesAssignment` / `ProspectActivity` /
`CallNote` / `FollowUp`, `Quote` (rep-guardrailed), and `CommissionPlan` /
`CommissionRecord` with clawback. This doc defines the **rules and the build**; the
tables exist.

---

## 1. The deal in one paragraph

A rep is an **independent contractor**, not an employee. They source local-business
prospects, give them a free AI website preview (PageBee's whole pitch — see
[ONBOARDING.md](ONBOARDING.md)), answer questions, may offer **approved setup-fee
discounts**, and help the prospect create an account and pay the setup fee. When the
prospect **becomes a paying client** (setup fee collected + first month cleared and
past the clawback window), the rep earns a **per-client commission**, tiered by plan.
Reps work only their own assigned prospects, get reminders and tooling to follow up,
and have a resource library to ramp up on PageBee's features.

---

## 2. Rep lifecycle

```
Recruit → Apply → Sign contract (e-sign) → Onboard/Certify → Sell → Get paid → (Offboard)
```

1. **Recruit** (Upwork/Fiverr/direct). Screen for English, local-SMB sales comfort,
   timezone overlap.
2. **Create rep** — admin creates an `Employee{ employeeType: COMMISSION_REP }` linked
   to a new scoped `User` login. Collect tax form (W-9 US / W-8BEN non-US) and payout
   method (Phase 3 of ops; manual until then).
3. **Sign contract** — rep reviews and **e-signs** the
   [Sales-Rep Commission Agreement](contracts/sales-rep-commission-agreement.md) in the
   portal. `Contract.status: DRAFT → SENT → SIGNED → ACTIVE`, `signedAt` stamped,
   signed PDF stored to object storage (`Contract.documentUrl`). **No selling before
   ACTIVE.**
4. **Onboard / certify** — rep completes the resource hub's required modules. Until
   certified, the rep can add prospects and log activity but **cannot send quotes**
   (gate on a `certifiedAt` flag).
5. **Sell** — work the funnel (§4), within guardrails (§5).
6. **Get paid** — commissions accrue, become eligible after the clawback window, are
   approved, and paid out (§6).
7. **Offboard** — deactivate login, revoke prospect access, settle final eligible
   commissions, retain records for tax/audit. Unworked prospects return to the pool.

---

## 3. Commission economics {#commission-economics}

The schema's `CommissionPlan` carries a **per-plan base**, an optional **recurring
tail**, and a **clawback window**. Recommended starting structure (the figures the
user floated — "~$100 per converted client" — refined into a plan-tiered model that
tracks our own margin):

| Plan | Setup fee | Monthly | **Rep base commission** | Notes |
| --- | --- | --- | --- | --- |
| Nectar | $399 | $39 | **$60** | entry tier |
| Honey | $699 | $89 | **$110** | the "$100" target tier |
| Hive | $999 | $179 | **$185** | highest effort/value |

> ⚠️ These supersede the schema defaults (`launchBase`/`connectBase`/`automateBase`
> = 25/50/75), which use stale plan names and are too low. Rename the fields to
> `nectarBase`/`honeyBase`/`hiveBase` and seed with the above (see
> [INTERNAL_OPS.md §4](INTERNAL_OPS.md#4-known-schema-gaps-to-resolve-before-building)).
> **Final numbers are the user's call** — these are a recommendation, not a decision.

**Definition of "converted" (when commission is earned).** A `CommissionRecord` is
created `PENDING` when the prospect's setup fee is collected, and becomes `ELIGIBLE`
only when **both**: (a) the **first monthly payment** has cleared, and (b) the
**clawback window** (`CommissionPlan.clawbackDays`, default 30) has passed without
cancellation/refund/chargeback. This stops reps earning on signups that immediately
churn. Commission is computed from **actual collected revenue** (`basis`,
`collectedRevenue`), never from listed price.

**Discount ↔ commission coupling.** Reps can discount the **setup fee** down to the
floor (§5). To keep incentives aligned, **base commission is reduced proportionally to
the setup-fee discount granted** beyond a free allowance:
- Discount within the allowed floor and ≤ $50 off → full base.
- Deeper approved discounts (or waived setup) → base reduced by the same percentage as
  the setup fee, floored at 50% of base. (Rep still earns, but can't "buy" the deal
  with our margin.)

**Optional recurring tail (retention incentive).** `recurringPct` / `recurringMonths`
let us pay, e.g., **5% of collected monthly fee for 6 months**, to reward reps who
bring clients that *stay*. Recommend enabling this **after** the base program is
stable — it makes settlement more complex. Off by default (`0`/`0`).

**Clawback.** If the client cancels/refunds within `clawbackDays`, the record flips to
`CLAWED_BACK` (or is netted against the next payout if already paid). Recurring-tail
months simply stop when the client leaves.

---

## 4. The funnel & tracking {#tracking}

Every prospect a rep touches is attributed and measured. The funnel mirrors
[ONBOARDING.md §9](ONBOARDING.md):

```
Prospect added → Contacted → Preview sent → Quote sent → Account created → Setup paid → CONVERTED
```

**Attribution.** When a rep adds a `Prospect`, a `SalesAssignment` locks it to that
rep. `Prospect.convertedClient` links the resulting `Client`. On setup-fee payment, a
`CommissionRecord` is created for the assigned rep, tied to that `Client`.

**Per-rep metrics (the rep dashboard + admin rollup):**
- Prospects added · contacted · previews sent · quotes sent · **closed (converted)**
- **Conversion rate** at each stage; overall prospect→client %
- Avg discount granted · discount-impact on close rate
- Revenue sourced (setup + recurring) · commission earned (pending/eligible/paid)
- Time-to-close · follow-ups overdue · activity recency

**Activity log.** `ProspectActivity` (call/email/meeting/note), `CallNote`
(outcome + note), `FollowUp` (due date → reminder). Every prospect has a timeline.

---

## 5. Discount guardrails {#guardrails}

Straight from [FEATURE_FLAGS.md discount rules](FEATURE_FLAGS.md#discount-rules) and
[ONBOARDING.md §10](ONBOARDING.md) — reps prefer **setup-fee** discounts; **any monthly
discount needs admin approval**:

| Plan | Listed setup | **Rep floor (no approval)** | Listed monthly |
| --- | --- | --- | --- |
| Nectar | $399 | **$299** | $39 |
| Honey | $699 | **$599** | $89 |
| Hive | $999 | **$899** | $179 |

**Requires admin approval** (`Quote.requiresApproval = true`, queued as
`QuoteApproval`): any monthly-fee discount, setup below the floor, waived setup, or
more than one discount on a quote. The pricing-rule engine sets the flag automatically
on quote creation; reps cannot self-approve. This is enforced **server-side** — the
guardrail is not a UI nicety.

---

## 6. Settlement & payout (Phase 3 dependency)

1. **Accrue** — `CommissionRecord` PENDING at setup-fee payment.
2. **Eligible** — sweep flips PENDING→ELIGIBLE once first month clears + clawback
   window passes (cron, alongside the existing finance sweep).
3. **Approve** — admin reviews the eligible queue → APPROVED (audited).
4. **Pay** — batched into a payout run; PAID + `paidAt` stamped. **Payout rail is the
   one missing piece** (see [INTERNAL_OPS.md §4.2](INTERNAL_OPS.md#4-known-schema-gaps-to-resolve-before-building))
   — Wise/PayPal/Stripe payouts/Upwork milestone. Manual until Phase 3.
5. **Clawback** — cancellation inside the window reverses or nets the record.

Each rep gets a **commission statement** (eligible/paid/clawed-back, per client).

---

## 7. The rep portal — what we build {#portal}

A new scoped surface (e.g. `/rep/*`), rep-isolated. Pages:

- **Dashboard** — my funnel, earnings (pending/eligible/paid), overdue follow-ups,
  certification status.
- **Prospects (CRM)** — list/search *my* prospects; add prospect; prospect detail with
  activity timeline, call notes, follow-ups.
- **Preview request** — kick off the free AI website preview for a prospect (reuses the
  existing preview/generation pipeline).
- **Quotes** — create a quote within guardrails; out-of-guardrail quotes flag for admin
  approval; send quote/payment link; track viewed/accepted.
- **Account help** — assist a prospect in creating an account (a rep-initiated
  onboarding link, attributed to the rep).
- **Reminders & meetings** — schedule follow-ups (reminder to rep via email/SMS through
  the notification funnel); create a **Zoom meeting** for a prospect (Zoom API or a
  scheduling link); attach **recorded-call** links for training/QA (see compliance).
- **Resource hub** — training videos, demo links, scripts, feature how-tos, FAQs,
  objection handling (see §8).
- **My contract** — view the signed agreement and commission terms.

**Build order inside Phase 1:** (a) rep auth + scoping + contract e-sign →
(b) Prospect CRM + activities/follow-ups + reminders → (c) resource hub →
(d) quotes + guardrails → (e) conversion attribution + commission accrual →
(f) earnings dashboard. Each ships behind the rep role; admins get the mirror/rollup.

---

## 8. Enablement: resources to get reps up to speed {#resources}

Backed by `InternalDocument` (category `rep_resource`, sub-tagged). **First-step
content set** (the minimum to make a rep productive — the user will expand later with
custom demos/videos):

- **Product 101** — what PageBee is, the preview-before-you-pay model, who it's for.
- **Plan & pricing sheet** — Nectar/Honey/Hive, what each includes, the discount floors.
- **Feature deep-dives** — leads, booking, chat/AI, payments, invoices, gallery,
  Google Business Profile — one explainer each (so reps build real expertise).
- **The pitch & scripts** — cold open, the free-preview hook, objection handling, the
  exact rep script from [ONBOARDING.md §9](ONBOARDING.md).
- **Demo assets** — a sample generated site + a short walkthrough video (placeholder
  now; richer later).
- **How-tos** — add a prospect, request a preview, build a quote, request an approval,
  create a Zoom meeting, log a call.
- **Compliance one-pager** — what reps may/may not say and do (§9). **Required reading,
  gated before certification.**

Certification = rep completes the required modules → `certifiedAt` set → quoting
unlocked. Keep a simple completion check now; a real quiz later.

---

## 9. Compliance & legal — the landmines {#compliance--legal-the-landmines}

Outbound sales by contractors is where this program can actually hurt us. **Bake these
in, don't bolt them on:**

- **Call-recording consent.** "Recorded calls for training" is regulated — many US
  states (and most countries) require **all-party consent**. Reps must announce
  recording and get consent; we store consent state with the recording. Do **not** ship
  call recording without this.
- **TCPA** (calls/SMS) — no autodialing, honor Do-Not-Call, respect calling hours,
  consent for SMS. PageBee's own SMS is one-way owner alerts; rep prospecting SMS is a
  different beast — prefer email/manual calls first.
- **CAN-SPAM** (cold email) — accurate sender, physical address, working opt-out.
- **No false/unauthorized claims.** Reps have **no authority to bind PageBee**, promise
  features we don't have, or invent pricing. Contract makes this explicit.
- **PII / data protection.** Reps access prospect contact data — least-privilege
  scoping, audit logging, and **full revocation on offboarding**. Prospect data is
  PageBee's, not the rep's; no exporting/keeping lists.
- **Worker classification.** Reps are **1099/independent contractors** — the contract
  and our conduct must avoid employee-like control (no fixed hours, no exclusivity
  required, rep supplies own tools). Misclassification is a real liability.
- **Upwork/Fiverr ToS.** These platforms generally require payments run **through them**
  for the engagement (Upwork has an opt-out/conversion fee to hire off-platform).
  Decide up front: pay commissions via the platform's milestones, or convert reps
  off-platform legitimately. Don't quietly route around their ToS.

---

## 10. Anti-abuse controls {#anti-abuse}

Commission programs invite gaming. Controls:

- **Self-dealing** — flag reps converting prospects that quickly cancel/refund; the
  clawback window + "first month cleared" eligibility blunts fake signups. Watch for
  rep-linked emails/cards.
- **Lead stealing / collision** — prospect **dedup** on normalized business
  name/phone/email + **first-touch assignment lock**; a second rep adding the same
  business is blocked or flagged, not silently double-credited.
- **Stale-lead hoarding** — prospects untouched for N days return to the pool.
- **Discount abuse** — guardrails + approval queue + the discount↔commission coupling
  (§3) remove the incentive to over-discount.
- **Attribution window** — define how long after a rep's last touch a conversion still
  credits them (e.g. 60 days), so old prospects don't pay out on unrelated direct
  signups.

---

## 11. Open decisions (need the user) {#open-decisions}

1. **Exact commission amounts** per plan (recommendation in §3).
2. **Recurring tail** — enable now or after the base program is stable? (recommend
   after.)
3. **Payout rail** — Wise / PayPal / Stripe payouts / Upwork milestones?
4. **Upwork strategy** — pay through-platform vs convert off-platform.
5. **Attribution window** length and **stale-lead** release period.
6. **Exclusivity / quota / ramp** — any minimum activity to stay active?
7. **Recorded calls** — ship in Phase 1 or defer until the consent flow is built?
   (recommend defer.)

---

## 12. What's intentionally *not* in Phase 1

Quote→client onboarding automation (Phase 2), automated payout rail (Phase 3),
salaried/hourly payroll (Phase 4), company finances (Phase 5), and richer
demo/video content (user-supplied later). Phase 1 makes a rep able to **sign on,
learn, sell within the rules, and have every conversion tracked and owed** — paid
manually until Phase 3 automates it.
