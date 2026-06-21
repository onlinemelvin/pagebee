// Resend Domains API (REST) — register a client's sending domain and read back
// the DKIM/SPF/DMARC records they must add, then poll until verified. Server-only
// (uses RESEND_API_KEY). Mirrors the fetch-based style of supabase/admin.ts.

const API = "https://api.resend.com";

export interface ResendDnsRecord {
  record: string; // "DKIM" | "SPF" | "DMARC"
  name: string;
  type: string; // "TXT" | "MX" | "CNAME"
  value: string;
  ttl?: string;
  priority?: number;
  status?: string;
}

export interface ResendDomain {
  id: string;
  name: string;
  status: string; // "not_started" | "pending" | "verified" | "failed" | "temporary_failure"
  records: ResendDnsRecord[];
}

function key(): string | null {
  return process.env.RESEND_API_KEY || null;
}

function headers(k: string) {
  return { Authorization: `Bearer ${k}`, "Content-Type": "application/json" };
}

/** Register a sending domain in Resend. Returns the domain id + DNS records to add. */
export async function createResendDomain(name: string): Promise<ResendDomain | { error: string }> {
  const k = key();
  if (!k) return { error: "resend_not_configured" };
  const res = await fetch(`${API}/domains`, { method: "POST", headers: headers(k), body: JSON.stringify({ name }) });
  const body = (await res.json().catch(() => ({}))) as ResendDomain & { message?: string };
  if (!res.ok) return { error: body.message ?? `resend_error_${res.status}` };
  return { id: body.id, name: body.name, status: body.status, records: body.records ?? [] };
}

/** Read a domain's current verification status + records. */
export async function getResendDomain(id: string): Promise<ResendDomain | { error: string }> {
  const k = key();
  if (!k) return { error: "resend_not_configured" };
  const res = await fetch(`${API}/domains/${id}`, { headers: headers(k) });
  const body = (await res.json().catch(() => ({}))) as ResendDomain & { message?: string };
  if (!res.ok) return { error: body.message ?? `resend_error_${res.status}` };
  return { id: body.id, name: body.name, status: body.status, records: body.records ?? [] };
}

/** Ask Resend to (re)check DNS now. */
export async function verifyResendDomain(id: string): Promise<{ ok: boolean; error?: string }> {
  const k = key();
  if (!k) return { ok: false, error: "resend_not_configured" };
  const res = await fetch(`${API}/domains/${id}/verify`, { method: "POST", headers: headers(k) });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false, error: body.message ?? `resend_error_${res.status}` };
  }
  return { ok: true };
}

export async function deleteResendDomain(id: string): Promise<void> {
  const k = key();
  if (!k) return;
  await fetch(`${API}/domains/${id}`, { method: "DELETE", headers: headers(k) }).catch(() => {});
}
