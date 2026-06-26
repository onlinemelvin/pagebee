import { getClientWorkspace } from "@/lib/modules/client";
import { getNotificationPrefs } from "@/lib/modules/notification";
import { getSmsPrefs } from "@/lib/modules/messaging";
import { NotificationSettings } from "@/components/client/NotificationSettings";
import { SmsAlertSettings } from "@/components/client/SmsAlertSettings";
import { MemberProfile } from "@/components/client/MemberProfile";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;

  // Notification preferences are an account-level, owner-only setting. Staff get a personal
  // profile page instead (their name + email + sign-out) — no account-wide controls.
  if (ws.role !== "owner") {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-3xl text-stone-900">Settings</h1>
        <p className="mt-1 text-stone-500">Manage your personal account.</p>
        <div className="mt-6">
          <MemberProfile initialName={ws.userName ?? ""} email={ws.email} businessName={ws.client.businessName} />
        </div>
      </div>
    );
  }

  const [prefs, smsPrefs] = await Promise.all([getNotificationPrefs(ws.client.id), getSmsPrefs(ws.client.id)]);
  const sms = ws.features.find((f) => f.key === "sms");
  const smsAvailable = sms?.state !== "locked";
  const smsPlanLabel = sms?.toPlanLabel ?? sms?.toPlan ?? "a higher plan";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl text-stone-900">Settings</h1>
      <p className="mt-1 text-stone-500">Manage how PageBee keeps you in the loop.</p>
      <div className="mt-6 space-y-6">
        <NotificationSettings initial={prefs} />
        <SmsAlertSettings initial={smsPrefs} available={smsAvailable} planLabel={smsPlanLabel} />
      </div>
    </div>
  );
}
