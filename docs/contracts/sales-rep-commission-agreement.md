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

---

## Independent Contractor Sales & Commission Agreement

This Independent Contractor Sales & Commission Agreement (the **"Agreement"**) is
entered into as of **{{effectiveDate}}** (the **"Effective Date"**) by and between:

- **{{companyLegalName}}**, operating the PageBee platform ("**PageBee**," "**we**,"
  "**us**"), with its principal place of business at {{companyAddress}}; and
- **{{repLegalName}}**, an independent contractor ("**Rep**," "**you**"), of
  {{repAddress}}, email {{repEmail}}.

PageBee and Rep are each a "Party" and together the "Parties."

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

### 2. Scope of Services

Rep will, in good faith and using their own judgment:

(a) identify and contact local-business Prospects;
(b) present PageBee accurately, including the **free AI website preview** offered
before any payment;
(c) answer Prospect questions and build genuine expertise in PageBee's features;
(d) where appropriate, offer **approved discounts** within the guardrails in §4;
(e) assist Prospects with account creation and setup-fee payment; and
(f) log all Prospect interactions in the PageBee rep portal (prospects, activities,
call notes, follow-ups).

Rep will perform all services **lawfully and ethically** (§6) and only after this
Agreement is **ACTIVE** and any required certification is complete.

### 3. Commission

3.1 **Earning event ("Conversion").** Rep earns a commission when a Prospect
**assigned to Rep** in the PageBee system becomes a **paying client**, defined as:
(a) the client's **setup fee is collected**, **and** (b) the client's **first monthly
subscription payment has cleared**, **and** (c) the **clawback period** in §5 has
elapsed without cancellation, refund, or chargeback.

3.2 **Commission amounts.** Per converted client, by plan, under the active
commission plan **{{commissionPlanName}}**:

| Plan | Base Commission |
| --- | --- |
| Nectar | {{nectarBase}} |
| Honey | {{honeyBase}} |
| Hive | {{hiveBase}} |

3.3 **Computed on collected revenue.** Commission is calculated from **revenue
actually collected** from the client, not list price. If Rep grants an approved
setup-fee discount beyond the standard allowance, the base commission is **reduced in
the same proportion as the discount**, floored at **50%** of the base for that plan.

3.4 **Recurring commission (if enabled).** Where the active plan specifies a recurring
component, Rep additionally earns **{{recurringPct}}% of collected monthly fees for
{{recurringMonths}} months**, ceasing when the client cancels. If `0`, no recurring
commission applies.

3.5 **One commission per client.** Each converted client yields commission to **one**
Rep — the Rep of record (first-touch assignment). Disputed or duplicate attributions
are resolved by PageBee in good faith; PageBee's records are controlling.

3.6 **No draw / no advance.** Commissions are not advanced. Unconverted Prospects,
previews, quotes, and effort that do not result in a Conversion earn nothing.

### 4. Discount Authority (Guardrails)

4.1 Rep may offer **setup-fee discounts only** down to the published rep floor, with
**no** monthly-fee discount, without prior approval:

| Plan | Listed Setup | Rep Floor (no approval) |
| --- | --- | --- |
| Nectar | $399 | $299 |
| Honey | $699 | $599 |
| Hive | $999 | $899 |

4.2 **Any** monthly-fee discount, any setup fee **below** the floor, a **waived** setup
fee, or **more than one** discount on a quote **requires PageBee approval** through the
quote-approval workflow. Rep may not self-approve or circumvent the system.

4.3 PageBee may change pricing, floors, and the commission plan **prospectively** on
**{{noticeDays}} days' notice**; changes do not affect commissions already earned.

### 5. Clawback & Reversal

5.1 **Clawback period:** **{{clawbackDays}} days** from the client's setup-fee payment.

5.2 If, within the clawback period, the client cancels, is refunded, charges back, or
fails to complete the first monthly payment, the related commission is **not earned**
(or, if already paid, is **reversed and offset** against future commissions or repaid
by Rep within 30 days).

5.3 PageBee may withhold payout of any commission reasonably suspected of fraud,
self-dealing, or guardrail violation pending review.

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
payable on the normal schedule; pending/unconverted items earn nothing. §§5–8, 7,
10–12 survive.

### 10. Payment Terms

10.1 Earned, non-clawed-back commissions are approved and paid on a **{{payoutCadence}}**
cadence via **{{payoutMethod}}**, after PageBee receives a valid tax form (§1.3).

10.2 Rep is paid in **{{payoutCurrency}}**; any platform (e.g. Upwork/Fiverr),
transfer, or currency-conversion fees are **Rep's responsibility** unless agreed
otherwise in writing.

10.3 PageBee provides a **commission statement** each period (earned, paid,
clawed-back, by client).

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
| `payoutCadence`, `payoutMethod`, `payoutCurrency` | rep payout profile (Phase 3) |
| `governingLaw`, `disputeResolution` | platform config (attorney-set) |
| `repSignature`, `repSignDate`, `signatureAuditRef`, `companySignDate` | e-sign flow |

**Defaults to confirm with the user / attorney:** `noticeDays` 30, `restrictDays` 180,
`terminationNoticeDays` 14, `liabilityWindowMonths` 12, `clawbackDays` 30,
`payoutCadence` monthly.
