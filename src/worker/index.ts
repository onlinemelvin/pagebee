// PageBee background generation worker.
//   Local:  npm run worker          (run alongside `npm run dev`, or instead of the inline trigger)
//   Prod:   run as a separate Node process (Railway/Fly/Render/VM) with GENERATION_WORKER=external
//           set on the web app so the API only enqueues. This is the durable, Vercel-safe path —
//           it can spawn the Magic npx subprocess, which serverless/edge cannot.
import fs from "node:fs";

// Load .env (tsx does not auto-load it). Skipped silently in prod where real env vars are set.
try {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const key = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim().replace(/^"|"$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
} catch {
  /* no .env file — rely on the process environment */
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // Import AFTER env is loaded above (the Prisma client reads DATABASE_URL at module load).
  const { claimNextQueuedJob, runGenerationJob, requeueStaleJobs } = await import(
    "@/lib/modules/website"
  );

  console.log("[worker] PageBee generation worker started");
  const recovered = await requeueStaleJobs();
  if (recovered) console.log(`[worker] requeued ${recovered} stale job(s)`);

  for (;;) {
    try {
      const id = await claimNextQueuedJob();
      if (id) {
        console.log(`[worker] processing job ${id}`);
        await runGenerationJob(id);
        console.log(`[worker] finished job ${id}`);
      } else {
        await sleep(3000);
      }
    } catch (err) {
      console.error("[worker] tick error:", err);
      await sleep(5000);
    }
  }
}

main();
