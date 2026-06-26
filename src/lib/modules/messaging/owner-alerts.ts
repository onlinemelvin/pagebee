import { sendSms } from "./service";
import { getSmsPrefs, isSmsGroupAllowed, type SmsGroup } from "./sms-prefs";

/**
 * Fire a one-way SMS alert to the business owner — the "Layer 1" notification of the messaging
 * design (docs/MESSAGING.md): tap the owner on the shoulder; they reply in the web app via the link.
 *
 * Fail-soft: an SMS hiccup (off-plan, opted out, no number, provider down) must NEVER break the
 * action that triggered it. Gating order: owner opted in for this group → has a number → `sendSms`
 * then enforces the plan flag, the monthly allowance, and the STOP suppression list.
 */
export async function notifyOwnerSms(clientId: string, group: SmsGroup, body: string): Promise<void> {
  try {
    if (!(await isSmsGroupAllowed(clientId, group))) return;
    const prefs = await getSmsPrefs(clientId);
    if (!prefs.phone) return;
    // consentVerified: the owner explicitly opted in with their own number via settings.
    await sendSms(clientId, prefs.phone, body, { consentVerified: true });
  } catch (err) {
    console.error(`[sms:owner-alert] ${group} alert failed for client ${clientId}`, err);
  }
}
