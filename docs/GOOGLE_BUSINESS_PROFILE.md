# Google Business Profile (GBP) — Feature Spec

Status: **proposed** (design). Adds a Google Business Profile capability split across
**Connect** and **Automate**. The SEO/local-ranking layer is explicitly **out of scope
for v1** and tracked as a future enhancement (§10).

> Naming: this feature manages a client's **Google Business Profile** (GBP, formerly
> Google My Business) — the listing that appears on Google Maps and in local Search.
> In user-facing copy say "Google Business Profile" / "your Google listing", never
> "tier". Plan names are **Connect** and **Automate** (uppercase plan names per
> existing copy conventions).

---

## 1. Reality check (why this is assisted, not one-click)

Two hard limits from Google shape the entire design — neither is removable by us:

1. **No programmatic listing creation.** As of 2026 the Google Business Profile API
   has **no endpoint to create a new location from scratch.** A listing must first be
   created/claimed by the owner in the GBP dashboard. The API only *manages* listings
   that already exist (info, hours, photos, reviews, posts, performance).
2. **Owner verification is mandatory and human-gated.** New listings now default to
   **video verification** (signage + interior + a live action), with rising rejection
   rates. This deliberately blocks bulk automated creation and requires the owner's
   participation. Most verifications go to human review (~up to 5 business days).

Plus: **API access is gated** — we must apply to Google, justify the use case, hold our
own GBP active 60+ days, and each Cloud project starts at **zero quota**. **Bulk
verification** does not apply to us (it's for one brand's 10+ locations, explicitly not
for agencies managing many different businesses in one account).

**Consequence:** PageBee offers a *guided, semi-automated, managed* GBP capability —
a setup wizard the owner completes, then automated ongoing management via API. We never
promise "we put you on Google Maps automatically" or "guaranteed ranking" (also barred
by the sales discount rules in FEATURE_FLAGS.md → "Reps may never offer").

---

## 2. Plan split

| Capability | Launch | Connect | Automate |
| --- | :--: | :--: | :--: |
| GBP guided setup + claim wizard | ❌ | ✅ | ✅ |
| Profile sync (NAP, hours, website/domain, categories) | ❌ | ✅ | ✅ |
| Photo push from Media library | ❌ | ✅ | ✅ |
| Review surfacing (read-only, in dashboard) | ❌ | ✅ | ✅ |
| **Active review management (reply / publish back to Google)** | ❌ | ❌ | ✅ |
| **AI reply compose (draft + tone control)** | ❌ | ❌ | ✅ |
| **Performance metrics dashboard** (calls, directions, searches, views) | ❌ | ❌ | ✅ |
| Google Posts publishing | ❌ | ❌ | ✅ (future-adjacent, see §10) |
| SEO / local-ranking service | ❌ | ❌ | 🔜 future (§10) |

Rationale: **Connect** = mostly self-serve software + light support (low marginal cost,
strong upsell hook). **Automate** = recurring AI + active management work (real per-client
cost → correctly the premium tier), consistent with how AI assistant / AI follow-ups are
already Automate-only.

---

## 3. Feature flags

New canonical flags (added to `plans.featureFlags` JSON in FEATURE_FLAGS.md; per-client
overrides via the `feature_flags` table as usual). Gating is by **flag**, never plan name.

```jsonc
// CONNECT — add:
"gbpEnabled": true,            // setup wizard + sync + read-only reviews
"gbpReviewReplies": false,
"gbpAiReplies": false,
"gbpMetrics": false

// AUTOMATE — add:
"gbpEnabled": true,
"gbpReviewReplies": true,      // publish replies back to Google
"gbpAiReplies": true,          // AI-composed drafts
"gbpAiRepliesIncludedMonthly": 200,   // metered like aiRepliesIncludedMonthly
"gbpMetrics": true
```

Enforcement (per FEATURE_FLAGS.md §"Enforcement points"):
- `requireFeature("gbpEnabled")` on all `/api/v1/client/gbp/*` routes.
- `requireFeature("gbpReviewReplies")` on reply-publish; `requireFeature("gbpAiReplies")`
  + `requireWithinLimit("gbpAiReplies")` on AI compose (counts an `aiReplies`-style
  `UsageRecord`, key `gbpAiReplies`).
- `requireFeature("gbpMetrics")` on the metrics endpoints.
- Nav: show the **Google** tab to all tiers with locked sub-features + UpgradeGate
  (matches existing nav-upsell model).

---

## 4. Data model (Prisma additions)

Namespaced `gbp_*`. All client-owned rows carry `clientId` and are scoped in the service
layer (tenant isolation invariant). The existing `review` module is website-preview
comments — unrelated; this is a new `gbp` module.

```prisma
// One per client: the OAuth + linked-location state for their Google Business Profile.
model GbpAccount {
  id        String  @id @default(cuid())
  clientId  String  @unique
  client    Client  @relation(fields: [clientId], references: [id], onDelete: Cascade)

  // GBP resource identifiers once the owner links a profile.
  googleAccountId  String?   // accounts/{id}
  locationId       String?   // locations/{id}  (the linked listing)
  locationName     String?   // cached display name for the dashboard

  // OAuth — store refresh token ENCRYPTED at rest (app-layer), never plaintext.
  refreshTokenEnc  String?
  tokenScopes      String?
  connectedAt      DateTime?

  // Lifecycle. drives the wizard UI state machine (see §7).
  status           String   @default("not_started")
  // not_started | oauth_linked | needs_create | pending_verification | verified | suspended | error
  verificationState String? // cached from Google: PENDING | COMPLETED | FAILED | UNSPECIFIED
  lastSyncedAt     DateTime?
  lastError        String?

  reviews   GbpReview[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("gbp_accounts")
}

// Mirror of a Google review so we can surface (Connect) and reply (Automate) without
// re-fetching every render. Source of truth stays Google; we sync.
model GbpReview {
  id            String   @id @default(cuid())
  clientId      String
  gbpAccountId  String
  account       GbpAccount @relation(fields: [gbpAccountId], references: [id], onDelete: Cascade)

  googleReviewId String  @unique  // reviews/{id}
  reviewerName  String?
  starRating    Int?            // 1..5
  comment       String?
  createReTime  DateTime?       // when the reviewer posted

  // Reply state (Automate).
  replyText     String?
  replyDraft    String?         // AI-composed, awaiting owner approval
  replyStatus   String   @default("none") // none | draft | published | failed
  repliedAt     DateTime?

  syncedAt      DateTime @default(now())

  @@index([clientId, createReTime])
  @@map("gbp_reviews")
}

// Daily performance snapshot (Automate). Pulled from the Performance API.
model GbpMetricDaily {
  id           String   @id @default(cuid())
  clientId     String
  gbpAccountId String
  date         DateTime @db.Date

  callClicks       Int @default(0)
  directionRequests Int @default(0)
  websiteClicks    Int @default(0)
  searchViewsDesktop Int @default(0)
  searchViewsMobile  Int @default(0)
  mapsViewsDesktop   Int @default(0)
  mapsViewsMobile    Int @default(0)

  @@unique([clientId, date])
  @@index([clientId, date])
  @@map("gbp_metrics_daily")
}
```

Notes:
- **NAP source of truth stays in `Client` / `ClientSetting`** (`businessName`,
  `ownerPhone`, `businessHours`, `serviceAreas`, the live custom domain). The sync worker
  pushes *from* those *to* Google — GBP storage holds only mirror/state, no duplicated
  authoritative address book.
- `refreshTokenEnc` is encrypted application-side (e.g. libsodium/`GBP_TOKEN_ENC_KEY`),
  never committed, never logged — consistent with "no secrets in code" and the secret
  scanning hook.

---

## 5. Module structure (`src/lib/modules/gbp/`)

Mirror the `customer` module layout (`index.ts` / `schema.ts` / `service.ts`), with an
extra `google-client.ts` for the API wrapper.

```
src/lib/modules/gbp/
  index.ts          // public exports
  schema.ts         // Zod: link payload, reply input, sync filters
  service.ts        // business logic, all queries scoped by clientId; GbpError class
  google-client.ts  // thin GBP REST wrapper (auth, refresh, locations, reviews, perf)
```

Service responsibilities (per backend-patterns layering — logic in service, not routes):
- `getGbpState(clientId)` → wizard state DTO.
- `startOAuth(clientId)` / `completeOAuth(clientId, code)` → link account, store enc token.
- `linkLocation(clientId, locationId)` / `refreshVerification(clientId)`.
- `syncProfile(clientId)` → push NAP/hours/domain/photos; pull verification state.
- `syncReviews(clientId)` / `composeReplyDraft(clientId, reviewId)` (AI) /
  `publishReply(clientId, reviewId, text)`.
- `syncMetrics(clientId, range)`.

Every mutating call: `writeAudit(...)`, `captureServerPosthogEvent` on success,
`captureExceptionToSentry` in catch, `logInfo`/`logError` with `requestId` + `route`.

---

## 6. API routes (`/api/v1/client/gbp/*`)

All guarded by `requireFeature("gbpEnabled")` + client auth; `clientId` from session,
never the body.

| Method & path | Flag | Purpose |
| --- | --- | --- |
| `GET  /client/gbp` | gbpEnabled | wizard state + linked location summary |
| `POST /client/gbp/oauth/start` | gbpEnabled | returns Google consent URL |
| `GET  /client/gbp/oauth/callback` | gbpEnabled | exchange code, store enc refresh token |
| `GET  /client/gbp/locations` | gbpEnabled | list claimable/linkable locations |
| `POST /client/gbp/location` | gbpEnabled | link a chosen location |
| `POST /client/gbp/sync` | gbpEnabled | manual "push my info now" |
| `GET  /client/gbp/verification` | gbpEnabled | refresh + return verification state |
| `GET  /client/gbp/reviews` | gbpEnabled | list synced reviews (read-only on Connect) |
| `POST /client/gbp/reviews/{id}/draft` | gbpAiReplies | AI-compose a reply draft |
| `POST /client/gbp/reviews/{id}/reply` | gbpReviewReplies | publish reply to Google |
| `GET  /client/gbp/metrics` | gbpMetrics | performance series for dashboard |

CSRF state param on the OAuth round-trip bound to the session (mirror the existing Stripe
Connect OAuth session-binding hardening). Rate-limit `oauth/start` and `sync`.

---

## 7. Verification wizard (the owner-facing flow)

State machine driven by `GbpAccount.status`. This is where most value + support burden
lives; make it guided and forgiving.

```
not_started → [Connect Google] → oauth_linked
oauth_linked → has existing listing? ── yes → linkLocation → pending_verification | verified
                                     └─ no  → needs_create → (owner creates in GBP dashboard,
                                                              we deep-link + prefill guidance)
pending_verification → [poll verification state] → verified | (failed → retry guidance)
verified → ongoing sync active
```

UI steps:
1. **Connect Google** (OAuth consent).
2. **Find or create your listing** — we list matches from their NAP; if none, deep-link to
   GBP creation with copy-paste-ready name/address/phone/category/website (the new domain).
3. **Verify** — explain video verification, show Google's "film signage + interior + a live
   action, 60–120s" guidance, then poll state and surface result.
4. **Done** — show what we now sync automatically; link to the Google tab dashboard.

Copy must set expectations: "Google reviews and may take a few business days. We'll notify
you when you're verified." Never imply instant Maps presence.

---

## 8. Workers (`src/lib/workers/gbp/`)

Follow existing worker-sweep conventions (see media/leads/scheduling workers):
- **gbp-sync** (e.g. daily): for each verified `GbpAccount`, push profile diffs
  (NAP/hours/domain/photos from Media where `inGallery`/`kind=logo`), pull verification
  state, update `lastSyncedAt`.
- **gbp-reviews** (e.g. hourly): pull new reviews → upsert `GbpReview`; on Automate with
  AI enabled, optionally pre-generate `replyDraft` (still owner-approved before publish).
- **gbp-metrics** (daily): pull yesterday's performance into `GbpMetricDaily` (Automate).

Token refresh handled in `google-client.ts`; on hard auth failure set `status="error"` +
`lastError`, surface a "reconnect Google" prompt in the dashboard.

---

## 9. UI

- **Client nav:** new **Google** tab (`src/app/(client)/client/google/`), visible to all
  tiers; Connect sees setup + read-only reviews; Automate-only panels (reply, metrics) are
  locked behind UpgradeGate for lower tiers.
- **Reviews panel:** list with rating/comment; Automate adds reply box + "Draft with AI"
  button (shows usage against `gbpAiRepliesIncludedMonthly`).
- **Metrics panel (Automate):** calls / directions / website clicks / views over time.
- **Admin:** surface `GbpAccount.status` + `lastError` per client for support triage.

---

## 10. Out of scope for v1 (future enhancements)

- **SEO / local-ranking service** (the "Automate gets SEO" idea): ongoing local keyword &
  category optimization, citation building, review-velocity strategy, reporting. Decision
  to make later: **AI-driven with a human review gate** (scalable, fits ai-model-tiers) vs
  human-managed (expensive, doesn't scale). Recommended: AI-driven + human gate.
- **Google Posts** publishing cadence (adjacent; easy to add to Automate after v1).
- **Multi-location** GBP per client (only relevant if we ever sell multi-location plans).

---

## 11. Env vars (add to `.env.example`, document as required)

```
GBP_OAUTH_CLIENT_ID=
GBP_OAUTH_CLIENT_SECRET=
GBP_OAUTH_REDIRECT_URI=
GBP_TOKEN_ENC_KEY=          # app-layer encryption for stored refresh tokens
# Google Cloud project must have Business Profile APIs enabled + quota approved.
```

---

## 12. Build phases

1. **Schema + flags + module skeleton** — Prisma models, flag additions in
   FEATURE_FLAGS.md, `gbp` module with `GbpError` + DTOs, encrypted-token storage.
2. **OAuth + linking + wizard** — routes, `google-client.ts`, the §7 state machine, Connect
   read-only reviews.
3. **Sync workers** — profile + reviews sync (Connect), verification polling.
4. **Automate layer** — reply publish, AI compose (+ usage metering), metrics ingestion +
   dashboard.
5. **Admin triage + observability polish.**
6. *(future)* SEO service + Google Posts.

---

## 13. Open decisions

- **Google API access approval** is a real-world prerequisite and gates phases 2+. File the
  GBP API access request early — it can take weeks and is not guaranteed.
- AI reply monthly allowance numbers (`gbpAiRepliesIncludedMonthly`) — placeholder 200;
  confirm against Automate margin.
- Whether AI drafts auto-generate on sync vs on-demand (cost vs convenience).
</content>
</invoke>
