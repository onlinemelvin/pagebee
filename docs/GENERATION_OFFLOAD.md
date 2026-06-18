# Vercel-safe website generation (Supabase Edge offload)

The website **HTML** generation call streams up to 32k tokens and runs 1–2 minutes — past Vercel's
**60-second** function cap (Hobby). So on Vercel the long call is offloaded to a **Supabase Edge
Function**, which the free tier lets run as a background task for up to **150 seconds**. Everything
else (Prisma, the short config call, image re-hosting, lead/booking split, Tailwind precompile,
version writes) stays on Node/Vercel.

## Flow

```
POST /api/v1/client/website/generate          (Vercel)
   └─ enqueue job (QUEUED) → 202
   └─ after(): prepareGeneration(jobId)        (Vercel, ≤60s)
        • resolve plan/intake, short CONFIG Claude call, fetch+rehost images
        • build the HTML prompt → store on job.llmPrompt, prepared → job.prepared
        • POST the job to the edge function
              │
              ▼
   Supabase Edge Function  generate-website     (Deno, ≤150s background task)
        • read job.llmPrompt → run the long Anthropic HTML call → write job.llmResult
        • POST /api/v1/internal/generate/finalize
              │
              ▼
   POST /api/v1/internal/generate/finalize      (Vercel, ≤60s)
        • finalizeHtmlFromText + markNoGallery + Tailwind precompile
        • split lead/booking → create WebsiteVersion → job NEEDS_REVIEW → preview IN_REVIEW
```

Code: [src/lib/modules/website/generation-offload.ts](../src/lib/modules/website/generation-offload.ts),
the edge function [supabase/functions/generate-website/index.ts](../supabase/functions/generate-website/index.ts),
and the prompt builders in [src/lib/ai/website-generator.ts](../src/lib/ai/website-generator.ts)
(`buildHtmlPrompt` / `finalizeHtmlFromText` are shared by the worker and the offload, so they never drift).

Local dev and the `npm run worker` process are **unchanged** — they run the original inline
`runGenerationJob` (Magic + native Tailwind included). The offload only kicks in when
`process.env.VERCEL` is set.

## One-time setup

### 1. Deploy the edge function
```bash
supabase login          # if not already
supabase link --project-ref <your-project-ref>
supabase functions deploy generate-website --no-verify-jwt
```
`--no-verify-jwt` is required: the function authenticates with our shared `INTERNAL_API_SECRET`
(sent as `x-internal-secret`), not a Supabase JWT.

### 2. Set the edge function's secrets
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically. Set the rest:
```bash
supabase secrets set \
  ANTHROPIC_API_KEY="sk-ant-..." \
  INTERNAL_API_SECRET="<same value as on Vercel>" \
  APP_URL="https://<your-vercel-domain>"
```
- `APP_URL` is where the edge function calls back `/api/v1/internal/generate/finalize` — your live app URL.
- `INTERNAL_API_SECRET` **must match** the value set on Vercel (below).

### 3. Set Vercel env vars (Production) and redeploy
| Var | Value |
|---|---|
| `GENERATION_EDGE_URL` | `https://<project-ref>.supabase.co/functions/v1/generate-website` |
| `INTERNAL_API_SECRET` | same secret as the edge function |
| `ANTHROPIC_API_KEY` | your key (used by the short config call on Vercel) |
| `NEXT_PUBLIC_APP_URL` | `https://<your-vercel-domain>` |

Then redeploy so the new env applies.

## Limits & known gaps
- **150s ceiling (Supabase free):** a generation that streams longer than ~150s is killed mid-flight
  and the job stays `GENERATING` (no `llmResult`). Retry it from the admin queue. If this happens
  often, trim the HTML prompt or drop `max_tokens` in `buildHtmlPrompt`.
- **Magic is off in the offload path** (serverless can't spawn the `npx` subprocess) — pure-Claude,
  by design. The local worker still uses Magic.
- **Revisions (surgical edits) are not offloaded yet.** `prepareGeneration` routes stub/surgical jobs
  to the inline path; on Vercel a real surgical edit would exceed 60s. Wiring revisions through the
  same edge offload is the next step (regenerate-from-scratch already goes through full generation).
- **Tailwind precompile on finalize** relies on `outputFileTracingIncludes` in
  [next.config.ts](../next.config.ts) bundling the native `@tailwindcss/oxide` binary into that
  function. If it can't load, `inlineTailwind` falls back to the Tailwind CDN (site still works,
  heavier first paint).
