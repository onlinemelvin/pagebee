"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send, Sparkles, Mail, Phone, X, Bot, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChatMessageDTO } from "@/lib/modules/chat";

interface Conversation {
  id: string;
  status: string;
  visitorName: string | null;
  visitorEmail: string | null;
  visitorPhone: string | null;
  leadId: string | null;
  messages: ChatMessageDTO[];
}

export function ChatThread({ conversation, canReply }: { conversation: Conversation; canReply: boolean }) {
  const router = useRouter();
  const [messages, setMessages] = React.useState<ChatMessageDTO[]>(conversation.messages);
  const [status, setStatus] = React.useState(conversation.status);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [drafting, setDrafting] = React.useState(false);
  const seen = React.useRef(new Set(conversation.messages.map((m) => m.id)));
  const endRef = React.useRef<HTMLDivElement>(null);

  const scrollDown = React.useCallback(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), []);
  React.useEffect(scrollDown, [messages, scrollDown]);

  // Poll for new visitor (or teammate) messages while the thread is open.
  React.useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/v1/client/chats/${conversation.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { conversation: Conversation };
        setStatus(data.conversation.status);
        const fresh = data.conversation.messages.filter((m) => !seen.current.has(m.id));
        if (fresh.length) {
          fresh.forEach((m) => seen.current.add(m.id));
          setMessages((cur) => [...cur, ...fresh]);
        }
      } catch {
        /* ignore */
      }
    };
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [conversation.id]);

  function pushOwn(msg: ChatMessageDTO) {
    seen.current.add(msg.id);
    setMessages((cur) => [...cur, msg]);
  }

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/client/chats/${conversation.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply", message: body }),
      });
      const data = (await res.json()) as { message?: ChatMessageDTO };
      if (!res.ok || !data.message) throw new Error();
      pushOwn(data.message);
      setText("");
      setStatus("human");
    } catch {
      /* keep the text so they can retry */
    } finally {
      setBusy(false);
    }
  }

  async function autoCompose() {
    if (drafting) return;
    setDrafting(true);
    try {
      const res = await fetch(`/api/v1/client/chats/${conversation.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "draft" }),
      });
      const data = (await res.json()) as { draft?: string };
      if (data.draft) setText(data.draft);
    } catch {
      /* ignore */
    } finally {
      setDrafting(false);
    }
  }

  async function close() {
    await fetch(`/api/v1/client/chats/${conversation.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "close" }),
    });
    router.push("/client/chats");
  }

  const name = conversation.visitorName || "Website visitor";

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-3xl flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-stone-200 pb-3">
        <Link href="/client/chats" className="grid h-9 w-9 place-items-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="Back to chats">
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg text-stone-900">{name}</p>
          <p className="flex flex-wrap items-center gap-x-3 text-xs text-stone-500">
            {conversation.visitorEmail && <span className="inline-flex items-center gap-1"><Mail size={11} /> {conversation.visitorEmail}</span>}
            {conversation.visitorPhone && <span className="inline-flex items-center gap-1"><Phone size={11} /> {conversation.visitorPhone}</span>}
            {conversation.leadId && <Link href="/client/inquiries" className="inline-flex items-center gap-1 font-medium text-amber-700 hover:underline">View lead <ExternalLink size={11} /></Link>}
          </p>
        </div>
        {status !== "closed" && (
          <Button variant="ghost" size="sm" onClick={close}><X size={14} /> Close</Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto py-4">
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "customer" ? "justify-start" : m.role === "system" ? "justify-center" : "justify-end")}>
            <div
              className={cn(
                "max-w-[78%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                m.role === "customer" && "rounded-bl-sm bg-white text-stone-800 shadow-card",
                m.role === "ai" && "rounded-br-sm bg-violet-100 text-violet-900",
                m.role === "owner" && "rounded-br-sm bg-amber-500 text-white",
                m.role === "system" && "bg-stone-100 text-xs text-stone-500",
              )}
            >
              {m.role === "ai" && <span className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-violet-500"><Bot size={10} /> AI</span>}
              {m.body}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      {status === "closed" ? (
        <p className="border-t border-stone-200 py-4 text-center text-sm text-stone-400">This conversation is closed.</p>
      ) : canReply ? (
        <div className="border-t border-stone-200 pt-3">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={`Reply to ${name}…`} />
          <div className="mt-2 flex items-center gap-2">
            <Button onClick={send} disabled={busy || !text.trim()}><Send size={14} /> {busy ? "Sending…" : "Send"}</Button>
            <Button variant="outline" onClick={autoCompose} disabled={drafting}>
              <Sparkles size={14} /> {drafting ? "Drafting…" : "Auto-compose"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="border-t border-stone-200 py-4 text-center text-sm text-stone-400">You have view-only access to chats.</p>
      )}
    </div>
  );
}
