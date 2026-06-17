// Thin client for the Vercel Domains API — the only place that talks to Vercel. We add a tenant's
// custom domain to the project, read its verification state, and remove it on downgrade/churn.
// Vercel auto-issues the SSL cert once DNS resolves, so there's nothing to manage there.
//
// Auth: a project- or team-scoped token (VERCEL_TOKEN). Find IDs in the Vercel dashboard:
//   VERCEL_PROJECT_ID  — Project → Settings → General
//   VERCEL_TEAM_ID     — Team → Settings (omit for a personal account)
// Docs: https://vercel.com/docs/rest-api/endpoints/projects#add-a-domain-to-a-project

const API = "https://api.vercel.com";

function token() {
  return process.env.VERCEL_TOKEN ?? "";
}
function projectId() {
  return process.env.VERCEL_PROJECT_ID ?? "";
}
function teamQuery() {
  const team = process.env.VERCEL_TEAM_ID;
  return team ? `?teamId=${encodeURIComponent(team)}` : "";
}

/** Whether real Vercel provisioning is wired. When false, the approval flow runs in manual mode:
 *  we still compute + show DNS records, but verification must be confirmed out-of-band. */
export function vercelConfigured(): boolean {
  return Boolean(token() && projectId());
}

/** A domain-ownership verification challenge Vercel returns when it needs proof (e.g. the apex is
 *  attached elsewhere). The owner adds these TXT records alongside the routing records. */
export interface VercelVerification {
  type: string; // "TXT"
  domain: string;
  value: string;
  reason?: string;
}

export interface VercelDomain {
  name: string;
  verified: boolean;
  verification?: VercelVerification[];
}

class VercelError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "VercelError";
  }
}

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    // Never let a slow Vercel call hang an admin action or the cron sweep.
    signal: AbortSignal.timeout(10_000),
  });
}

async function parseError(res: Response): Promise<VercelError> {
  const data = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  return new VercelError(
    res.status,
    data?.error?.code ?? "vercel_error",
    data?.error?.message ?? `Vercel API ${res.status}`,
  );
}

/**
 * Add a domain to the Vercel project. Idempotent enough for our flow: a domain that's already on
 * the project (code "domain_already_in_use" / 409) is treated as success and re-read. Returns the
 * domain's current verification state (and any TXT challenges to surface to the owner).
 *
 * `opts.redirect` makes this host a 308 redirect to another host on the project — used for the
 * sibling of an apex/www pair so e.g. www.acme.com forwards to the canonical acme.com.
 */
export async function addProjectDomain(
  name: string,
  opts?: { redirect?: string },
): Promise<VercelDomain> {
  const body: Record<string, unknown> = { name };
  if (opts?.redirect) {
    body.redirect = opts.redirect;
    body.redirectStatusCode = 308;
  }
  const res = await call("POST", `/v10/projects/${projectId()}/domains${teamQuery()}`, body);
  if (res.ok) return (await res.json()) as VercelDomain;
  const err = await parseError(res);
  // Already attached to THIS project — fine, just read its state. (If it's on another Vercel
  // account the GET below still returns it as unverified with a TXT challenge.)
  if (res.status === 409 || err.code === "domain_already_in_use") {
    return getProjectDomain(name);
  }
  throw err;
}

/** Read a project domain's verification state. */
export async function getProjectDomain(name: string): Promise<VercelDomain> {
  const res = await call(
    "GET",
    `/v9/projects/${projectId()}/domains/${encodeURIComponent(name)}${teamQuery()}`,
  );
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as VercelDomain;
}

/**
 * Ask Vercel to (re)check DNS and verify the domain. Returns the post-verify state. Safe to call
 * repeatedly (the cron sweep does). A not-yet-resolving domain simply comes back verified: false.
 */
export async function verifyProjectDomain(name: string): Promise<VercelDomain> {
  const res = await call(
    "POST",
    `/v9/projects/${projectId()}/domains/${encodeURIComponent(name)}/verify${teamQuery()}`,
  );
  if (res.ok) return (await res.json()) as VercelDomain;
  // 4xx that isn't auth → not verifiable yet; fall back to a plain read so the caller can decide.
  if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 403) {
    return getProjectDomain(name);
  }
  throw await parseError(res);
}

/** Remove a domain from the project (downgrade/churn/owner removal). A 404 is treated as success. */
export async function removeProjectDomain(name: string): Promise<void> {
  const res = await call(
    "DELETE",
    `/v9/projects/${projectId()}/domains/${encodeURIComponent(name)}${teamQuery()}`,
  );
  if (res.ok || res.status === 404) return;
  throw await parseError(res);
}

export { VercelError };
