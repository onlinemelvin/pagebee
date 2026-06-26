// One-off SMS smoke test — verifies Twilio credentials + sender end-to-end WITHOUT a real lead.
// It calls the low-level provider directly (no plan flag / opt-in / DB), so it tests purely:
// auth → sender number → carrier delivery.
//
//   npm run sms:test -- +15551234567            (your VERIFIED mobile while on the Twilio trial)
//   npm run sms:test -- +15551234567 "hello"
//
// Unconfigured (no TWILIO_* env) → it stubs to the console and tells you so.

import fs from "node:fs";

// Load .env (tsx does not auto-load it). Skipped silently when real env vars are already set.
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

async function main() {
  const to = process.argv[2];
  const body = process.argv[3] ?? "PageBee test ✅ — your SMS alerts are wired up. Reply STOP to opt out.";
  if (!to) {
    console.error("Usage: npm run sms:test -- <+E164phone> [message]\n  e.g. npm run sms:test -- +15551234567");
    process.exit(1);
  }

  // Import AFTER env is loaded (the provider reads TWILIO_* at module load).
  const { smsConfigured, sendProviderSms } = await import("@/lib/sms/twilio");

  if (!smsConfigured()) {
    console.warn("⚠ TWILIO_* not configured — this will STUB (no real text sent). Set creds in .env to send for real.");
  }

  console.log(`→ Sending to ${to} …`);
  try {
    const res = await sendProviderSms(to, body);
    if (res.stubbed) {
      console.log("✅ Stubbed (no provider configured). Wire TWILIO_* to send for real.");
    } else {
      console.log(`✅ Sent. Twilio message SID: ${res.sid}`);
      console.log("   If it doesn't arrive: on the trial the number must be VERIFIED, and toll-free needs verification.");
    }
  } catch (err) {
    console.error("✗ Send failed:", err instanceof Error ? err.message : err);
    console.error("  Common causes: unverified trial recipient, unverified toll-free sender, or a bad From/Messaging Service SID.");
    process.exit(1);
  }
}

main();
