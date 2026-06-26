import { prisma } from "@/lib/db";
import { classifyInbound, recordOptOut, recordOptIn } from "@/lib/modules/messaging";
import { validateTwilioSignature } from "@/lib/sms/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Minimal TwiML reply (Twilio expects XML). An empty <Response/> sends nothing back. */
function twiml(message?: string): Response {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new Response(body, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}

/**
 * POST — Twilio inbound-message webhook. Its primary job is STOP/START/HELP compliance: a recipient
 * texts STOP to opt out (suppressed in SmsOptOut), START to opt back in, HELP for info. We verify
 * Twilio's signature so a stranger can't forge opt-in events. No session (Twilio calls this).
 *
 * Twilio's Messaging Service Advanced Opt-Out also handles these at its edge; this keeps OUR record
 * in sync so the send path's suppression check is authoritative. Config: set this URL as the
 * Messaging Service inbound webhook in the Twilio console.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;

  // Verify authenticity. Twilio signs the exact URL it called; honor proxy headers for the host.
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const url = `${proto}://${host}/api/v1/public/sms/inbound`;
  const signature = req.headers.get("x-twilio-signature");
  if (!validateTwilioSignature(url, params, signature)) {
    return new Response("forbidden", { status: 403 });
  }

  const from = params.From ?? "";
  const keyword = classifyInbound(params.Body ?? "");

  if (keyword === "stop") {
    await recordOptOut(from, { reason: "user" });
    // Best-effort: also flip the owner's SMS prefs off if this number was their alert destination.
    await disableMatchingOwnerAlerts(from).catch(() => {});
    // Twilio auto-sends its own STOP confirmation when Advanced Opt-Out is on; stay silent to avoid dupes.
    return twiml();
  }
  if (keyword === "start") {
    await recordOptIn(from);
    return twiml();
  }
  if (keyword === "help") {
    return twiml("PageBee alerts. Reply STOP to opt out. Msg & data rates may apply.");
  }

  // Any other inbound message: nothing to do on the one-way alert path (two-way chat is future work).
  return twiml();
}

/** When a number opts out, turn off SMS alerts for any client using it as their alert destination. */
async function disableMatchingOwnerAlerts(phone: string): Promise<void> {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return;
  // smsSettings.notifications.phone is stored E.164; match on the trailing digits to be lenient.
  const rows = await prisma.clientSetting.findMany({
    where: { smsSettings: { path: ["notifications", "phone"], string_contains: digits.slice(-10) } },
    select: { clientId: true, smsSettings: true },
  });
  for (const row of rows) {
    const sms = (row.smsSettings ?? {}) as Record<string, unknown>;
    const notif = (sms.notifications ?? {}) as Record<string, unknown>;
    await prisma.clientSetting.update({
      where: { clientId: row.clientId },
      data: { smsSettings: { ...sms, notifications: { ...notif, enabled: false } } as object },
    });
  }
}
