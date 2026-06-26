import crypto from "node:crypto";

/**
 * Low-level Twilio Programmable Messaging client — fetch-based (no SDK), mirroring the style of
 * src/lib/resend/domains.ts. This is the ONE place the SMS provider lives: to swap Twilio for another
 * provider, reimplement `sendProviderSms` + `validateProviderSignature` here and nothing else changes.
 *
 * Falls back to a console stub when credentials are unset, so dev/CI runs without a Twilio account
 * (exactly like sendEmail with RESEND_API_KEY).
 *
 * Sender: prefer a Messaging Service SID (TWILIO_MESSAGING_SERVICE_SID) — it manages the sender pool
 * and, with Advanced Opt-Out enabled, handles STOP/START/HELP at Twilio's edge — over a single From
 * number (TWILIO_FROM_NUMBER).
 */
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
const fromNumber = process.env.TWILIO_FROM_NUMBER;

/** True when real credentials + a sender are configured (otherwise sends are stubbed). */
export function smsConfigured(): boolean {
  return Boolean(accountSid && authToken && (messagingServiceSid || fromNumber));
}

export interface ProviderSmsResult {
  sid: string | null;
  stubbed: boolean;
}

/** Send one SMS. Throws on a provider error; returns `{ stubbed: true }` when unconfigured. */
export async function sendProviderSms(to: string, body: string): Promise<ProviderSmsResult> {
  if (!smsConfigured()) {
    console.log(`[sms:stub] → ${to}: ${body.slice(0, 100)}`);
    return { sid: null, stubbed: true };
  }

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("Body", body);
  if (messagingServiceSid) form.set("MessagingServiceSid", messagingServiceSid);
  else form.set("From", fromNumber as string);

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const data = (await res.json().catch(() => null)) as { sid?: string; message?: string } | null;
  if (!res.ok) throw new Error(data?.message ?? `twilio_${res.status}`);
  return { sid: data?.sid ?? null, stubbed: false };
}

/**
 * Verify an inbound Twilio webhook (X-Twilio-Signature). Twilio signs the full request URL plus the
 * POST params (sorted by key, concatenated) with HMAC-SHA1 keyed by the auth token. Reject anything
 * that doesn't match so a stranger can't forge STOP/START events. Returns false when unconfigured.
 */
export function validateTwilioSignature(url: string, params: Record<string, string>, signature: string | null): boolean {
  if (!authToken || !signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
