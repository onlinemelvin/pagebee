# PageBee — Production Checklist

Running list of things to do **before / at go-live**. The app is built to run fine
with these unset (features degrade gracefully or fall back), so none of this blocks
development — but each item should be done before relying on that feature in prod.

Convention: `[ ]` = todo, `[x]` = done. Keep this file the single source of truth for
the prod cutover.

---

## 1. Environment variables (set in Vercel → Project → Settings → Environment Variables)

Many of these exist in [.env.example](../.env.example); the ones marked **(not in
.env.example)** were added later and are documented only here.

### Core
- [ ] `DATABASE_URL` — pooled Supabase connection (PgBouncer, port 6543, `?pgbouncer=true`)
- [ ] `DIRECT_URL` — direct connection (port 5432), Prisma Migrate only
- [ ] `NEXT_PUBLIC_APP_URL` — `https://pagebee.com` (drives Stripe redirect URLs, invoice links)
- [ ] `NEXT_PUBLIC_ROOT_DOMAIN` — `pagebee.com` (tenant subdomain routing `{slug}.pagebee.com`)
- [ ] `INTERNAL_API_SECRET` — strong random secret for `/api/v1/internal/*`
- [ ] `GENERATION_WORKER=external` — so the API only enqueues; run `npm run worker` as a
      separate process (Railway/Fly/Render/VM — not Vercel, it spawns subprocesses)

### Supabase (Auth / Storage)
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — server-only; never expose client-side

### Email (Resend)
- [ ] `RESEND_API_KEY` — without it, email falls back to console logging (no real sends)
- [ ] `RESEND_FROM_EMAIL` — e.g. `PageBee <noreply@pagebee.com>` (verify the domain in Resend)

### AI / media
- [ ] `ANTHROPIC_API_KEY` — website generation + AI assistant; without it the deterministic stub is used
- [ ] `ANTHROPIC_MODEL` — defaults to `claude-opus-4-8`
- [ ] `PEXELS_API_KEY` — stock photos for generated sites (optional; CSS backgrounds otherwise)
- [ ] `MAGIC_API_KEY` — 21st.dev Magic component generation (optional)

### Rate limiting **(not in .env.example)** — from the rate-limit work
- [ ] `UPSTASH_REDIS_REST_URL` — Upstash Redis REST endpoint
- [ ] `UPSTASH_REDIS_REST_TOKEN` — Upstash REST token
      > Without these the limiter uses an in-memory fallback that counts **per serverless
      > instance**, so effective limits multiply by the instance count. Set both for correct
      > cross-instance limiting on Vercel. The limiter fails open on Upstash errors.

### Secrets for signed tokens **(not in .env.example)**
- [ ] `STRIPE_CONNECT_STATE_SECRET` — HMAC secret binding the Connect OAuth `state` to a client
      (falls back to `SUPABASE_SERVICE_ROLE_KEY` if unset; set an explicit one in prod)
- [ ] `ICAL_FEED_SECRET` — signs the per-client iCal booking feed URLs
      (falls back to `SUPABASE_SERVICE_ROLE_KEY` if unset; set an explicit one in prod)

### Misc **(not in .env.example)**
- [ ] `NEXT_PUBLIC_DEMO_VIDEO_URL` — optional demo video on the create-site welcome screen

---

## 2. Stripe integration (go-live)

The integration is built end-to-end on **test keys**. Going live = swapping to live keys
and registering the two webhook endpoints in the live Stripe dashboard. Nothing in code
should need to change.

### Keys (swap test → live)
- [ ] `STRIPE_SECRET_KEY` — `sk_live_…` (platform secret; enables Connect, checkout, webhooks)
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — `pk_live_…` (embedded PageBee Pay onboarding, client-side)
- [ ] `STRIPE_CONNECT_CLIENT_ID` — live `ca_…` (Dashboard → Settings → Connect → OAuth)
- [ ] `STRIPE_PLATFORM_FEE_BPS` — application fee in basis points (default `200` = 2.00%)

### Webhooks (two separate endpoints — register both in the LIVE dashboard)
- [ ] **Connect / payments** → `POST {APP_URL}/api/v1/webhooks/stripe`
      → set `STRIPE_WEBHOOK_SECRET` (`whsec_…`) from that endpoint
- [ ] **Platform billing** (subscriptions/setup fees) → `POST {APP_URL}/api/v1/webhooks/stripe-billing`
      → set `STRIPE_BILLING_WEBHOOK_SECRET` (`whsec_…`) from that endpoint **(not in .env.example)**

### Connect OAuth
- [ ] In Dashboard → Settings → Connect → OAuth, set the redirect URI to
      `{NEXT_PUBLIC_APP_URL}/api/v1/client/payments/connect/oauth`

### Verify after cutover
- [ ] Platform billing: a client can pay the setup fee + first month; subscription shows active
- [ ] Connect "use ours" (Express) onboarding completes; a client→customer invoice checkout settles
- [ ] Connect "bring your own" (Standard via OAuth) links a client's own Stripe account
- [ ] Both webhook endpoints receive events and signature verification passes

---

## 3. Database
- [ ] All migrations applied to prod: `npx prisma migrate deploy`
- [ ] Seed the admin user: `npm run db:seed` (uses `ADMIN_EMAIL` / `ADMIN_PASSWORD`)
- [ ] Confirm RLS is enabled on all public tables (already migrated; Prisma `postgres` role
      has BYPASSRLS so the app is unaffected — this just protects the PostgREST anon path)

---

## 4. Background worker
- [ ] Run `npm run worker` as a long-lived process (handles website generation +
      booking reminder sweeps) with `GENERATION_WORKER=external` set on the web app
