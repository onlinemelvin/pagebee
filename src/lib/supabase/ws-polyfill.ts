// Node < 22 has no global WebSocket, which @supabase/supabase-js's realtime client
// requires at construction time (throws otherwise). Provide one from `ws`.
// Imported by the server Supabase client so server-side auth works on Node 20.
import ws from "ws";

const globalForWs = globalThis as unknown as { WebSocket?: unknown };
if (typeof globalForWs.WebSocket === "undefined") {
  globalForWs.WebSocket = ws;
}
