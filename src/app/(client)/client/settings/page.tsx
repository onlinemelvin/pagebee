import { redirect } from "next/navigation";
import { getClientWorkspace } from "@/lib/modules/client";
import { getNotificationPrefs } from "@/lib/modules/notification";
import { NotificationSettings } from "@/components/client/NotificationSettings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;
  // Notification preferences are an account-level, owner-only setting.
  if (ws.role !== "owner") redirect("/client");

  const prefs = await getNotificationPrefs(ws.client.id);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl text-stone-900">Settings</h1>
      <p className="mt-1 text-stone-500">Manage how PageBee keeps you in the loop.</p>
      <div className="mt-6">
        <NotificationSettings initial={prefs} />
      </div>
    </div>
  );
}
