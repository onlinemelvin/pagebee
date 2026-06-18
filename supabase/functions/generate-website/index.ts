// PageBee — website generation Edge Function (Deno / Supabase).
//
// WHY THIS EXISTS: the website HTML Claude call streams up to 32k tokens and runs 1–2 minutes,
// past Vercel's 60s function cap. This function is the ONLY long-running compute in the pipeline:
// the Vercel app's `prepare` phase builds the prompt and stores it on the job, then calls here; we
// run the Anthropic call (Supabase free tier allows ≤150s background tasks), write the raw HTML to
// the job, and call the Vercel `finalize` route to assemble the WebsiteVersion.
//
// Deploy:  supabase functions deploy generate-website --no-verify-jwt
// Secrets: supabase secrets set ANTHROPIC_API_KEY=... INTERNAL_API_SECRET=... APP_URL=https://<app>
//          (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
//
// Auth: callers must send `x-internal-secret: <INTERNAL_API_SECRET>` (same shared secret the Vercel
// app uses). Deployed with --no-verify-jwt because we gate on that secret, not a Supabase JWT.

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.102.0";

// Supabase background-task runtime global (lets the function keep working after it responds).
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

interface StoredPrompt {
  model: string;
  maxTokens: number;
  system: Anthropic.TextBlockParam[];
  user: string;
}

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get("INTERNAL_API_SECRET");
  if (!secret || req.headers.get("x-internal-secret") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }

  let jobId: string | undefined;
  try {
    jobId = (await req.json())?.jobId;
  } catch {
    /* fall through */
  }
  if (!jobId) return json({ error: "missing jobId" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
  const appUrl = Deno.env.get("APP_URL")!;
  const id = jobId;

  // Do the long call in the background (≤150s on the free tier) and respond immediately so the
  // Vercel dispatcher isn't held open. finalize is triggered once the HTML is written back.
  EdgeRuntime.waitUntil(
    (async () => {
      try {
        const { data, error } = await supabase
          .from("website_generation_jobs")
          .select("llmPrompt")
          .eq("id", id)
          .single();
        if (error || !data?.llmPrompt) throw new Error(`prompt not found: ${error?.message ?? "no llmPrompt"}`);
        const p = data.llmPrompt as StoredPrompt;

        const stream = anthropic.messages.stream({
          model: p.model,
          max_tokens: p.maxTokens,
          thinking: { type: "disabled" },
          system: p.system,
          messages: [{ role: "user", content: p.user }],
        });
        const message = await stream.finalMessage();
        const text = message.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim();
        if (!text) throw new Error("empty completion");

        await supabase.from("website_generation_jobs").update({ llmResult: text }).eq("id", id);

        const res = await fetch(`${appUrl}/api/v1/internal/generate/finalize`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal-secret": secret },
          body: JSON.stringify({ jobId: id }),
        });
        if (!res.ok) throw new Error(`finalize call failed: ${res.status}`);
      } catch (err) {
        console.error("[generate-website] failed for", id, err);
        await supabase
          .from("website_generation_jobs")
          .update({ status: "FAILED", error: String(err).slice(0, 500) })
          .eq("id", id);
      }
    })(),
  );

  return json({ ok: true, jobId: id }, 202);
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
