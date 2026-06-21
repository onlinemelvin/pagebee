// Supabase GoTrue admin REST calls via fetch — deliberately avoids @supabase/supabase-js
// (its realtime client needs a WebSocket that Node < 22 lacks). Server-only: uses the
// service-role key, which must never reach the browser.

function adminConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return {
    url,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
  };
}

export function isSupabaseAdminConfigured(): boolean {
  return adminConfig() !== null;
}

export type CreateAuthUserResult =
  | { ok: true; id: string }
  | { ok: false; status: number; error: string };

/** Create a confirmed Supabase Auth user. Returns the auth user id. */
export async function createAuthUser(email: string, password: string): Promise<CreateAuthUserResult> {
  const cfg = adminConfig();
  if (!cfg) return { ok: false, status: 500, error: "supabase_not_configured" };

  const res = await fetch(`${cfg.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: cfg.headers,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });

  if (res.ok) {
    const user = (await res.json()) as { id: string };
    return { ok: true, id: user.id };
  }

  const body = (await res.json().catch(() => ({}))) as { msg?: string; error_description?: string; code?: string };
  return { ok: false, status: res.status, error: body.msg ?? body.error_description ?? body.code ?? `auth_error_${res.status}` };
}

/** Set a Supabase Auth user's password (used by the branded password-reset flow). */
export async function updateAuthUserPassword(supabaseUserId: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = adminConfig();
  if (!cfg) return { ok: false, error: "supabase_not_configured" };
  const res = await fetch(`${cfg.url}/auth/v1/admin/users/${supabaseUserId}`, {
    method: "PUT",
    headers: cfg.headers,
    body: JSON.stringify({ password }),
  });
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => ({}))) as { msg?: string };
  return { ok: false, error: body.msg ?? `auth_error_${res.status}` };
}

/** Mark a Supabase Auth user's email as confirmed (used by the branded verify flow). */
export async function confirmAuthUserEmail(supabaseUserId: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = adminConfig();
  if (!cfg) return { ok: false, error: "supabase_not_configured" };
  const res = await fetch(`${cfg.url}/auth/v1/admin/users/${supabaseUserId}`, {
    method: "PUT",
    headers: cfg.headers,
    body: JSON.stringify({ email_confirm: true }),
  });
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => ({}))) as { msg?: string };
  return { ok: false, error: body.msg ?? `auth_error_${res.status}` };
}

/** Look up an existing auth user id by email (used when create reports a conflict). */
export async function findAuthUserId(email: string): Promise<string | undefined> {
  const cfg = adminConfig();
  if (!cfg) return undefined;
  const res = await fetch(`${cfg.url}/auth/v1/admin/users?per_page=200`, { headers: cfg.headers });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { users?: Array<{ id: string; email?: string }> };
  return data.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
}
