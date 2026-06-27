# Sales-Rep Commission Agreement (Independent Contractor)

**Template** for `Contract.type = SALES_REP_COMMISSION`. This is the document a
commission sales rep reviews and **e-signs** in the rep portal before activation
(`Contract.status: SENT → SIGNED → ACTIVE`). Render it with the `{{placeholders}}`
filled from the rep's `Employee` record and the active `CommissionPlan`, freeze the
result to a PDF, and store it at `Contract.documentUrl`.

> ⚖️ **Not legal advice.** This template was drafted by an AI assistant to be a
> practical, fair starting point. **Have it reviewed by a qualified attorney** in the
> governing jurisdiction before using it with real contractors — especially the
> worker-classification, IP, indemnity, and arbitration clauses, and any
> cross-border/tax specifics for non-US reps.

> 📖 **Read this in full.** It is written to be self-contained: after reading it you
> should know exactly **what you do**, **what you can offer**, **how and when you get
> paid**, and **when money can be taken back**. If anything is unclear, ask your
> manager *before* you sign — your signature means you understood and agreed. Section
> 13 tells you where to find everything else about how PageBee works.

---

## Independent Contractor Sales & Commission Agreement

This Independent Contractor Sales & Commission Agreement (the **"Agreement"**) is
entered into as of **{{effectiveDate}}** (the **"Effective Date"**) by and between:

- **{{companyLegalName}}**, operating the PageBee platform ("**PageBee**," "**we**,"
  "**us**"), with its principal place of business at {{companyAddress}}; and
- **{{repLegalName}}**, an independent contractor ("**Rep**," "**you**"), of
  {{repAddress}}, email {{repEmail}}.

PageBee and Rep are each a "Party" and together the "Parties."

### 0. Plain-language summary (non-binding)

This box is a quick orientation; the numbered sections below are what legally govern.

- **What PageBee is.** We build and host websites for local businesses and run the
  platform behind them (leads, booking, chat, payments, invoicing, AI). Clients pay a
  one-time **setup fee** plus a **monthly subscription**, on one of three plans:
  **Nectar**, **Honey**, **Hive**.
- **What you do.** Find local-business prospects, show them the **free AI website
  preview**, answer questions, optionally offer an **approved discount**, and help them
  create an account and pay. You log everything in the rep portal.
- **What you earn.** A **flat commission per converted client**, set by plan
  (see §3). You earn nothing on effort that doesn't convert.
- **When you're "converted."** Setup fee paid **and** first monthly payment cleared
  **and** the **{{clawbackDays}}-day clawback window** passed with no cancel/refund/
  chargeback (§3, §5).
- **When you're paid.** On a **{{payoutCadence}}** cadence after a commission becomes
  eligible (§10).
- **Clawback.** If the client bails inside the clawback window, that commission is not
  earned — and if it was already paid, it's reversed (§5).
- **Discounts.** You can lower the **setup fee** to a published floor on your own;
  anything deeper (or any **monthly** discount) needs approval, and deep discounts
  reduce your commission proportionally (§4).

### 1. Engagement & Independent-Contractor Status

1.1 PageBee engages Rep as an **independent contractor** to source, contact, and
help convert prospective clients ("**Prospects**") for PageBee's subscription website
services. Rep accepts the engagement on the terms below.

1.2 **No employment.** Rep is not an employee, partner, agent, or joint-venturer of
PageBee. Rep controls the manner, method, hours, and location of their work, supplies
their own equipment and internet, and is free to perform services for others
(non-compete is limited to §8). Nothing here creates an employment relationship.

1.3 **Taxes & benefits.** Rep is solely responsible for all taxes on amounts paid
under this Agreement and receives no employee benefits. Rep will provide a valid
**W-9** (US) or **W-8BEN/W-8BEN-E** (non-US) before any payout. PageBee may issue a
**1099** (or local equivalent) as required by law.

1.4 **No authority to bind.** Rep has **no authority** to enter contracts, make
promises, set or waive pricing, or create obligations on PageBee's behalf beyond the
discount authority expressly granted in §4. Quotes, pricing, account creation, and
service delivery are subject to PageBee's systems and approval.

### 2. Scope of Services & Your Role in the Funnel

2.1 Rep will, in good faith and using their own judgment:

(a) identify and contact local-business Prospects;
(b) present PageBee accurately, including the **free AI website preview** offered
before any payment;
(c) answer Prospect questions and build genuine expertise in PageBee's features;
(d) where appropriate, offer **approved discounts** within the guardrails in §4;
(e) assist Prospects with account creation and setup-fee payment; and
(f) log all Prospect interactions in the PageBee rep portal (prospects, activities,
call notes, follow-ups).

2.2 **The funnel.** Your job moves a Prospect through these stages, all tracked in the
portal:

```
Prospect added → Contacted → Preview sent → Quote sent → Account created → Setup paid → CONVERTED
```

You are measured on each stage (prospects added, contacted, previews/quotes sent,
closed) and on conversion rate, average discount, revenue sourced, and follow-up
timeliness. Keeping the portal up to date is part of the job — it is also how your
commission is attributed to you.

2.3 **Attribution & "Rep of record" (first touch).** When you add a Prospect, the
system **locks that Prospect to you** (a `SalesAssignment`). If that Prospect later
becomes a paying client, the commission is attributed to **you** as the Rep of record.
This is a **first-touch** rule: if a Prospect already exists under another rep, adding
them again does not move them to you. Duplicate or disputed attributions are resolved
by PageBee in good faith, and **PageBee's records are controlling** (§3.5).

2.4 Rep will perform all services **lawfully and ethically** (§6) and only after this
Agreement is **ACTIVE** and any required certification is complete.

### 3. Commission

3.1 **Earning event ("Conversion").** Rep earns a commission when a Prospect
**assigned to Rep** in the PageBee system becomes a **paying client**. All three of
the following must be true:

(a) the client's **setup fee is collected**; **and**
(b) the client's **first monthly subscription payment has cleared**; **and**
(c) the **clawback period** in §5 has elapsed without cancellation, refund, or
chargeback.

Until all three are met, the commission is only **pending** — it is not yet earned and
is not payable (§10).

3.2 **Commission amounts.** Per converted client, by plan, under the active
commission plan **{{commissionPlanName}}**:

| Plan | Listed setup | Listed monthly | Base Commission |
| --- | --- | --- | --- |
| Nectar | $399 | $39 | {{nectarBase}} |
| Honey | $699 | $89 | {{honeyBase}} |
| Hive | $999 | $179 | {{hiveBase}} |

The commission is a **flat amount per converted client** for that plan — it is **not**
a percentage of the setup or monthly fee (except the optional recurring tail in §3.4).

3.3 **Computed on collected revenue, with the discount coupling.** Commission is
calculated from **revenue actually collected** from the client, not list price. A
**free allowance of $50** off the setup fee does not affect your commission. If you
grant an approved setup-fee discount **deeper than $50**, your base commission is
**reduced by the same percentage as the setup-fee discount**, with a **floor of 50%**
of the base for that plan. Worked examples (Honey, base {{honeyBase}}, listed setup
$699):

| What you sold | Setup discount | Commission effect |
| --- | --- | --- |
| Full price ($699) | $0 | **Full base** ({{honeyBase}}) |
| $50 off ($649) | within free allowance | **Full base** ({{honeyBase}}) |
| $99 off ($600), ~14% off | 14% | base reduced ~14% |
| Floor $599 ($100 off), ~14% off | 14% | base reduced ~14% |
| Approved waived setup ($0) | 100% | reduced to the **50% floor** |

The rule keeps incentives aligned: you can still discount to win a deal, but you can't
"buy" the deal entirely out of PageBee's margin.

3.4 **Recurring commission (if enabled).** Where the active plan specifies a recurring
component, Rep additionally earns **{{recurringPct}}% of collected monthly fees for
{{recurringMonths}} months**, paid as each monthly payment clears and **ceasing
immediately when the client cancels** (no recurring tail is owed for months after
cancellation). If `0`, no recurring commission applies.

3.5 **One commission per client.** Each converted client yields commission to **one**
Rep — the Rep of record (first-touch assignment, §2.3). Disputed or duplicate
attributions are resolved by PageBee in good faith; PageBee's records are controlling.

3.6 **No draw / no advance.** Commissions are not advanced. Unconverted Prospects,
previews, quotes, demos, and effort that do not result in a Conversion earn nothing.

### 4. Discount Authority (Guardrails)

4.1 **What you can do on your own.** Rep may offer **setup-fee discounts only**, down
to the published rep floor, with **no** monthly-fee discount, **without** prior
approval:

| Plan | Listed Setup | Rep Floor (no approval) | Most you can take off solo |
| --- | --- | --- | --- |
| Nectar | $399 | $299 | $100 |
| Honey | $699 | $599 | $100 |
| Hive | $999 | $899 | $100 |

4.2 **What needs approval.** **Any** of the following must go through the
**quote-approval workflow** and be approved by PageBee before you offer it as final:

- any **monthly-fee** discount (of any size);
- any setup fee **below** the floor in §4.1;
- a **waived** setup fee; or
- **more than one** discount on the same quote.

The pricing engine flags these automatically. Rep may **not** self-approve, split a
discount across quotes, or otherwise circumvent the system.

4.3 **Remember the coupling.** Discounts deeper than the $50 free allowance reduce
your own commission proportionally (§3.3). Discounting is a tool to close, not a
default — the floor and the coupling exist so a discount is a deliberate choice.

4.4 PageBee may change pricing, floors, and the commission plan **prospectively** on
**{{noticeDays}} days' notice**; changes do **not** affect commissions already earned
on Conversions that have already occurred.

### 5. Clawback & Reversal

5.1 **Clawback period:** **{{clawbackDays}} days** from the client's setup-fee payment.
This is the window during which a new client can leave and undo your commission. Its
purpose is to ensure you are paid for clients who actually **stay**, not for sign-ups
that immediately churn.

5.2 **What triggers a clawback.** If, **within** the clawback period, the client:

- **cancels** their subscription;
- is **refunded** (in full or in part);
- issues a **chargeback**; or
- **fails to complete** the first monthly payment,

then the related commission is treated as follows:

- **Not yet paid:** the commission is **not earned** — it never becomes eligible and is
  marked `CLAWED_BACK`.
- **Already paid:** the amount is **reversed and offset** against your next/future
  commission payouts, or, if there are none sufficient, **repaid by Rep within 30
  days** of written notice.

5.3 **Partial refunds.** A partial refund reduces collected revenue; PageBee will
recompute the affected commission on the actual amount retained (consistent with the
collected-revenue rule in §3.3).

5.4 **Recurring tail.** Recurring-tail months (§3.4) simply **stop** when the client
leaves; you keep recurring amounts already earned on months that cleared before
cancellation, subject to the same clawback rules for any refunded month.

5.5 **After the window.** Once the {{clawbackDays}}-day window passes with the client
in good standing and the first month cleared, the commission becomes **eligible** and
is no longer subject to clawback for that conversion event.

5.6 **Fraud / guardrail holds.** PageBee may **withhold** payout of any commission
reasonably suspected of fraud, self-dealing, or guardrail violation pending review,
even after the clawback window.

### 6. Conduct, Compliance & Honesty

Rep will:

(a) make **only accurate** statements about PageBee, its features, and pricing — no
guarantees, invented features, or unauthorized promises;
(b) comply with all applicable laws governing outbound sales, including **TCPA**
(calls/SMS), **CAN-SPAM** (email), **Do-Not-Call** rules, and calling-hour limits;
(c) **not record any call** without obtaining all legally required consents and
announcing the recording; recordings, if any, are PageBee's property and stored only
in PageBee systems;
(d) not engage in spam, harassment, misrepresentation, or purchase of lead lists;
(e) not create, or assist in creating, **fake, self-owned, or collusive** sign-ups to
generate commission; and
(f) treat all Prospect and client data as PageBee Confidential Information (§7).

Breach of this section is grounds for **immediate termination** and forfeiture of
unpaid commissions tied to the breach.

### 7. Confidentiality, Data & Intellectual Property

7.1 **Confidential Information** includes Prospect/client data, pricing, the rep
portal, training materials, and PageBee's methods. Rep will use it **only** to perform
the services and will not disclose or retain it after termination.

7.2 **Data ownership.** All Prospect and client data Rep accesses or enters **belongs
to PageBee**. Rep will not export, copy, sell, or keep any list, and will lose access
to all such data upon termination. (A separate **NDA** (`ContractType.NDA`) may also
apply.)

7.3 **Work product / IP.** Any materials Rep creates for the engagement, and all
goodwill from sales activity, belong to PageBee. PageBee grants Rep a limited,
revocable license to use PageBee's name and approved materials **solely** to perform
the services.

### 8. Non-Solicitation & Limited Non-Compete

During the engagement and for **{{restrictDays}} days** after, Rep will not (a)
solicit PageBee clients or Prospects Rep worked under this Agreement for a competing
service, nor (b) solicit PageBee staff or other reps to leave. This Agreement is
**non-exclusive**; Rep may do other work that does not breach this section or §6–§7.

### 9. Term & Termination

9.1 This Agreement begins on the Effective Date and continues until terminated.

9.2 **Either Party may terminate for convenience on {{terminationNoticeDays}} days'
written notice.** PageBee may terminate **immediately** for breach of §4, §6, or §7,
or for suspected fraud.

9.3 **On termination:** Rep's portal access is revoked; Rep stops representing
PageBee; **commissions already earned** (Conversions past the clawback period) remain
payable on the normal schedule; pending/unconverted items earn nothing. §§5–8, 10–12
survive.

### 10. Payment Terms — How & When You Get Paid

10.1 **The commission lifecycle.** Every commission moves through these states, which
you can track in the rep portal:

| State | Meaning | Payable? |
| --- | --- | --- |
| **Pending** | Setup fee collected; recorded against you. | No |
| **Eligible** | First monthly payment cleared **and** clawback window passed (§5.5). | Yes — queued for the next payout |
| **Paid** | Included in a payout run and sent. | Done |
| **Clawed back** | Client left within the window (§5). | No — reversed/offset |

10.2 **Cadence (when payable).** Eligible, non-clawed-back commissions are approved
and paid on a **{{payoutCadence}}** cadence via **{{payoutMethod}}**, after PageBee
has received a valid tax form (§1.3). A commission earned mid-period is paid in the
**next** scheduled payout run after it becomes eligible — not at the moment of
conversion. Concretely: a sale converts → after the first month clears and the
{{clawbackDays}}-day window passes, it flips to **eligible** → it is paid in the next
**{{payoutCadence}}** run.

10.3 **Currency & fees.** Rep is paid in **{{payoutCurrency}}**; any platform (e.g.
Upwork/Fiverr), transfer, or currency-conversion fees are **Rep's responsibility**
unless agreed otherwise in writing.

10.4 **Statements.** PageBee provides a **commission statement** each period showing,
per client, what is pending, eligible, paid, and clawed-back, so you can reconcile
your earnings against your conversions.

10.5 **Minimum payout (if any).** {{minPayoutNote}}

### 11. Disclaimers, Liability & Indemnity

11.1 PageBee provides the platform and materials **"as is."** PageBee is not liable to
Rep for lost commissions arising from Prospect decisions, pricing/plan changes, or
service availability.

11.2 **Indemnity.** Rep will indemnify PageBee against claims, fines, and losses
arising from Rep's breach of §6 (e.g. TCPA/CAN-SPAM violations, unlawful recording,
misrepresentation).

11.3 Except for §7 (confidentiality) and §11.2 (indemnity), each Party's aggregate
liability is limited to commissions paid or payable in the **{{liabilityWindowMonths}}
months** before the claim.

### 12. General

12.1 **Governing law / venue:** {{governingLaw}}. **Dispute resolution:**
{{disputeResolution}}.

12.2 **Entire agreement; amendment.** This Agreement (with any NDA and the then-current
commission plan and pricing schedule, incorporated by reference) is the entire
agreement and may be amended only in writing (electronic acceptance counts).

12.3 **Assignment.** Rep may not assign this Agreement. PageBee may assign it to a
successor.

12.4 **Severability & waiver.** If any provision is unenforceable, the rest remains in
effect; no waiver is implied by delay.

12.5 **Electronic signature.** The Parties agree to sign electronically; the e-signature
and timestamp recorded by PageBee (`Contract.signedAt`) are valid and binding.

### 13. Where to Find Information (Knowledge & Resources)

13.1 You are never expected to memorize everything. Your single source of truth for
**how PageBee works, what each plan includes, pricing, the discount floors, demo
scripts, and feature how-tos** is the **Rep Resources hub** in your portal:

**→ {{repResourcesUrl}}** (in the portal: **Resources**)

13.2 The hub is kept current by your manager and covers, at minimum: a plan & pricing
sheet (Nectar/Honey/Hive and the discount floors), how the free AI website preview
works, the full feature set (leads, booking, chat, AI, payments, invoicing), pitch
decks and demos, call/email scripts, and compliance reminders.

13.3 If something you need isn't there, ask your manager — and if a Prospect asks
something you're unsure of, it is always better to say you'll follow up than to
guess (§6(a)).

---

### Signatures

**PageBee — {{companyLegalName}}**
By: {{companySignatoryName}}, {{companySignatoryTitle}}
Date: {{companySignDate}}

**Rep — {{repLegalName}}**
Signature (electronic): {{repSignature}}
Date: {{repSignDate}}
IP / audit reference: {{signatureAuditRef}}

---

## Placeholder reference (for the rendering layer)

| Placeholder | Source |
| --- | --- |
| `companyLegalName`, `companyAddress`, `companySignatoryName/Title` | platform config |
| `repLegalName`, `repAddress`, `repEmail` | `Employee` / linked `User` |
| `effectiveDate` | `Contract.effectiveDate` |
| `commissionPlanName`, `nectarBase`, `honeyBase`, `hiveBase`, `recurringPct`, `recurringMonths`, `clawbackDays` | active `CommissionPlan` |
| `noticeDays`, `restrictDays`, `terminationNoticeDays`, `liabilityWindowMonths` | policy constants |
| `payoutCadence`, `payoutMethod`, `payoutCurrency`, `minPayoutNote` | rep payout profile (Phase 3) |
| `repResourcesUrl` | portal URL — defaults to `{{appBase}}/rep/resources` |
| `governingLaw`, `disputeResolution` | platform config (attorney-set) |
| `repSignature`, `repSignDate`, `signatureAuditRef`, `companySignDate` | e-sign flow |

**Defaults to confirm with the user / attorney:** `noticeDays` 30, `restrictDays` 180,
`terminationNoticeDays` 14, `liabilityWindowMonths` 12, `clawbackDays` 30,
`payoutCadence` monthly, `repResourcesUrl` `/rep/resources`, `minPayoutNote` "No
minimum payout threshold applies." (adjust if a threshold is later set).
