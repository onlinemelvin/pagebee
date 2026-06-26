import { redirect } from "next/navigation";
import { getClientWorkspace } from "@/lib/modules/client";
import { getConversation } from "@/lib/modules/chat";
import { ChatThread } from "@/components/client/ChatThread";

export const dynamic = "force-dynamic";

export default async function ClientChatThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getClientWorkspace();
  if (!ws) return null;
  if (!ws.access.inquiries.view) redirect("/client");
  if (!ws.caps.ai) redirect("/client/chats");

  const conversation = await getConversation(ws.client.id, id);
  if (!conversation) redirect("/client/chats");

  return <ChatThread conversation={conversation} canReply={ws.access.inquiries.manage} />;
}
