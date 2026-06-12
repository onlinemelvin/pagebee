"use client";

import * as React from "react";

// Parent ↔ iframe protocol for the annotate bridge injected by serve.ts (serveReviewFrame).
// The parent positions pin markers from element rects the iframe reports; all messages are
// same-origin (the frame route lives on the app origin).

export interface BridgePin {
  id: string;
  selector: string | null;
  pagePath: string;
  x: number | null;
  y: number | null;
}

export interface PickPayload {
  anchor: { pagePath: string; selector: string; anchorText: string; x: number; y: number };
  rect: { x: number; y: number; w: number; h: number };
}

export interface RectsPayload {
  rects: Record<string, { x: number; y: number; w: number; h: number }>;
  pagePath: string;
}

interface Handlers {
  onReady?: (pagePath: string) => void;
  onNavigate?: (pagePath: string) => void;
  onPick?: (p: PickPayload) => void;
  onRects?: (p: RectsPayload) => void;
}

export interface PreviewBridge {
  setWant: (pins: BridgePin[]) => void;
  setPickMode: (on: boolean) => void;
  setRightClick: (on: boolean) => void;
  goto: (pagePath: string) => void;
  highlight: (selector: string | null) => void;
}

export function usePreviewBridge(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  handlers: Handlers,
): PreviewBridge {
  const h = React.useRef(handlers);
  React.useEffect(() => {
    h.current = handlers;
  });

  React.useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const m = (e.data ?? {}) as { type?: string } & Record<string, unknown>;
      if (m.type === "pb:ready") h.current.onReady?.(String(m.pagePath ?? "/"));
      else if (m.type === "pb:navigate") h.current.onNavigate?.(String(m.pagePath ?? "/"));
      else if (m.type === "pb:pick") h.current.onPick?.(m as unknown as PickPayload);
      else if (m.type === "pb:rects") h.current.onRects?.(m as unknown as RectsPayload);
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [iframeRef]);

  return React.useMemo<PreviewBridge>(() => {
    const post = (msg: unknown) => iframeRef.current?.contentWindow?.postMessage(msg, location.origin);
    return {
      setWant: (pins) => post({ type: "pb:want", pins }),
      setPickMode: (on) => post({ type: "pb:pick-mode", on }),
      setRightClick: (on) => post({ type: "pb:rc", on }),
      goto: (pagePath) => post({ type: "pb:goto", pagePath }),
      highlight: (selector) => post({ type: "pb:highlight", selector }),
    };
  }, [iframeRef]);
}
