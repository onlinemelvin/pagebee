# Domains — registration, scaling, and the registrar abstraction

How PageBee handles client custom domains, the risks that appear at scale, and the path to swap
registrars with a single adapter.

## Today (MVP)

Two paths (owner-facing, in `CustomDomainPanel`):

- **Connect** — the client already owns a domain → they point DNS at us, admin approves → live.
  No cost to PageBee.
- **Buy** — the client searches/AI-suggests a name; PageBee **registers it through the Vercel
  registrar** and **absorbs the cost**, then attaches it to the hosting project and points it at the
  client's site. A price cap (`DOMAIN_PRICE_CAP_CENTS`, default $20) auto-buys under the cap; over-cap
  parks for admin review.

Key files:

| Concern | File |
| --- | --- |
| Registrar contract (provider-agnostic) | `src/lib/registrar/types.ts` |
| Vercel adapter | `src/lib/registrar/vercel.ts` → wraps `src/lib/vercel/registrar.ts` |
| Registrar factory (`getRegistrar()`) | `src/lib/registrar/index.ts` |
| Buy/lookup/suggest flow | `src/lib/modules/website/domain-purchase.ts` |
| Attach domain to the host (Vercel) | `src/lib/vercel/domains.ts` |

The **registrant contact** for bought domains is the platform's (`REGISTRANT_*` env), so PageBee is
the legal registrant of every domain it buys for clients.

## ICANN email verification

Newly registered domains require ICANN **registrant-email verification**. This is **per registrant
email, not per domain** — once `admin@pagebee.com` (the `REGISTRANT_EMAIL`) is verified with the
registrar, subsequent domains under the same contact generally do **not** re-trigger it. So this is
usually a one-time click, not a recurring chore.

If it ever does recur per-domain, options in order of preference:

1. Ask the registrar (Vercel support) to set/keep a **pre-verified registrant contact** for the team.
2. **Auto-notify** an admin (Slack/email) the moment a purchase completes, so the link is clicked
   fast — wire into `executePurchase` / the domains cron. Robust, low effort.
3. Last resort — a scheduled inbox reader (Gmail API on the Workspace `admin@`, or inbound-parse)
   that extracts + GETs the verification link. Works but brittle; treat as fallback.

## Red flags at scale (thousands of domains under one registrant)

One contact owning many domains is normal for registrars/resellers, but at scale watch for:

1. **Abuse-reputation contagion** — a few abusive client domains can taint the registrant contact and
   draw scrutiny across the whole account. Mitigate with abuse monitoring + fast takedowns.
2. **Bulk-registration scrutiny / limits** — rapid mass registration under one account is the pattern
   registrars police (tasting/spam). Vercel's registrar is fine for MVP, **not built as a reseller**
   for thousands.
3. **Renewal cost + ownership liability** — as registrant, PageBee owns the domains and pays
   auto-renewals (~$10–15/yr each) and handles abuse/UDRP/law-enforcement requests. Churned clients =
   pay-to-renew or let lapse (and risk snipe).
4. **Single point of failure** — all domains in one registrar account; a suspension takes them all
   down at once.
5. **Verification bottleneck** — one inbox, many ICANN emails (see above).

## Migration plan (when, not now)

**Triggers:** roughly **hundreds of domains** OR the **first abuse complaint**, whichever first.

**Moves:**

- **Switch to a dedicated reseller registrar** — OpenSRS/Tucows, Namecheap reseller, Name.com, or
  **Cloudflare Registrar** (at-cost, strong API). Built for bulk + proper abuse handling.
- **Make the client the registrant** where possible (PageBee as admin/tech contact), or use a
  **privacy/proxy registrant** — sheds the "we own thousands of domains" liability + renewal exposure.
- **Abuse monitoring** on generated sites + a complaint-response process.
- **A renewal/expiry policy** — don't auto-renew churned clients; surface upcoming expiries.
- **Spread risk** across accounts/providers rather than one registrar account.

## Swapping the registrar = one adapter

The purchase flow depends only on the `Registrar` interface (`src/lib/registrar/types.ts`), so a
provider swap is local:

1. Add `src/lib/registrar/cloudflare.ts` exporting `cloudflareRegistrar: Registrar`
   (`configured` / `lookup` / `getPrice` / `buyDomain`).
2. Add a `case "cloudflare": return cloudflareRegistrar;` in `getRegistrar()`.
3. Set `REGISTRAR_PROVIDER=cloudflare`.

Nothing in `domain-purchase.ts` (or the UI) changes. Note: attaching a domain to the **host**
(`src/lib/vercel/domains.ts`) is a separate concern and stays Vercel — the host doesn't change when
the registrar does.
