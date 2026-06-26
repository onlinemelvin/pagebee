import { redirect } from "next/navigation";
import { getClientWorkspace } from "@/lib/modules/client";
import { listConversations, getChatConfig } from "@/lib/modules/chat";
import { ChatsInbox } from "@/components/client/ChatsInbox";
import { ChatSettings } from "@/components/client/ChatSettings";
import { UpgradeGate } from "@/components/client/UpgradeGate";

export const dynamic = "force-dynamic";

export default async function ClientChatsPage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;
  if (!ws.access.inquiries.view) redirect("/client"); // staff without inquiries access
  if (!ws.caps.ai)
    return <UpgradeGate title="Live chat" flag="aiAssistant" blurb="Let an AI assistant answer visitors on your website 24/7, book appointments, and hand off to you when a human's needed — on the HIVE plan." />;

  const isOwner = ws.role === "owner";
  const [conversations, config] = await Promise.all([listConversations(ws.client.id), isOwner ? getChatConfig(ws.client.id) : Promise.resolve(null)]);

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Chats</h1>
      <p className="mt-1 text-stone-500">Live conversations from your website assistant. Jump in anytime — the AI hands off to you when a visitor needs a human.</p>
      {isOwner && config && <ChatSettings initial={config} />}
      <ChatsInbox initial={conversations} />
    </div>
  );
}
