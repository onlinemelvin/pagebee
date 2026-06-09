import os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Headless integration with 21st.dev Magic. We use ONLY the headless tools
// (component_inspiration / logo_search) — the `component_builder` opens a browser
// for human selection and is unusable in an unattended pipeline.
//
// NOTE: this spawns `npx @21st-dev/magic` (stdio) so it requires a Node runtime
// that can spawn a subprocess — it works under `next dev` and a background worker,
// but NOT on Vercel serverless. It is fully guarded: any failure (no key, can't
// spawn, timeout) returns [] and generation falls back to pure Claude.

export interface MagicRef {
  query: string;
  componentName: string;
  code: string;
}

interface InspirationItem {
  componentName?: string;
  componentCode?: string;
}

/** Fetch reference components from the 21st.dev library for the given section queries. */
export async function fetchMagicReferences(queries: string[]): Promise<MagicRef[]> {
  const key = process.env.MAGIC_API_KEY;
  if (!key || queries.length === 0) return [];

  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  let client: Client | undefined;
  try {
    const transport = new StdioClientTransport({
      command,
      args: ["-y", "@21st-dev/magic@latest", `API_KEY="${key}"`],
      cwd: os.tmpdir(), // Magic writes test-results/ in cwd — keep it out of the repo
    });
    client = new Client({ name: "pagebee", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);

    const refs: MagicRef[] = [];
    for (const query of queries.slice(0, 4)) {
      try {
        const res = await client.callTool(
          { name: "21st_magic_component_inspiration", arguments: { message: query, searchQuery: query } },
          undefined,
          { timeout: 60000 },
        );
        const content = (res as { content?: Array<{ type: string; text?: string }> }).content ?? [];
        const text = content.map((c) => (c.type === "text" ? (c.text ?? "") : "")).join("");
        const items = JSON.parse(text) as InspirationItem[];
        const top = items.find((i) => i.componentCode);
        if (top?.componentCode) {
          refs.push({
            query,
            componentName: top.componentName ?? "component",
            code: top.componentCode.slice(0, 1600),
          });
        }
      } catch (err) {
        console.error(`[magic] inspiration failed for "${query}":`, (err as Error)?.message);
      }
    }
    return refs;
  } catch (err) {
    console.error("[magic] unavailable; falling back to pure Claude:", (err as Error)?.message);
    return [];
  } finally {
    await client?.close().catch(() => {});
  }
}
