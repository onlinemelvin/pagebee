// Tenant-scoped team permissions — the capabilities an owner can grant a staff member.
//
// Each feature AREA has two levels: "view" (read) and "manage" (read + write). Capability keys are
// stored on ClientUser.permissions / ClientUserInvite.permissions as `${area}:${action}` strings
// (e.g. "finance:manage"). Owners hold every capability implicitly — their array stays empty.
//
// This module is import-safe on both server and client (no server-only deps) so the Team UI and the
// API guards share one source of truth. Enforcement lives in:
//   • src/lib/auth/session.ts        — requireCapability() for API mutations
//   • src/lib/modules/client/workspace.ts — nav filtering + per-page view gating
//   • the feature pages               — redirect staff lacking view

export type AccessLevel = "none" | "view" | "manage";
export type AreaAction = "view" | "manage";

export interface TeamArea {
  key: string; // canonical area key (used in permission keys)
  label: string;
  description: string;
  navKeys: string[]; // nav-catalog keys this area governs (for sidebar filtering)
  flag: string | null; // plan feature flag the area requires (null = available on every plan)
}

/** The areas an owner can delegate. Order drives the permission editor's row order. */
export const TEAM_AREAS: TeamArea[] = [
  { key: "inquiries", label: "Inquiries", description: "Lead inbox & replies", navKeys: ["inquiries"], flag: "contactForm" },
  { key: "customers", label: "Customers", description: "Customer records (CRM)", navKeys: ["customers"], flag: null },
  { key: "appointments", label: "Appointments", description: "Booking calendar", navKeys: ["appointments"], flag: "booking" },
  { key: "finance", label: "Finance", description: "Invoices & payments", navKeys: ["invoices"], flag: "invoices" },
  { key: "website", label: "Website", description: "Site content, services & media", navKeys: ["website", "services", "media"], flag: null },
];

export const TEAM_AREA_KEYS = TEAM_AREAS.map((a) => a.key);

/** The delegable areas available on the client's current plan. `enabled` maps a feature-flag key →
 *  whether the plan includes it; areas with a null flag are always available. The Team UI only ever
 *  shows/grants these — a feature the plan lacks (e.g. Finance off) never appears, and when a plan is
 *  later upgraded the newly-unlocked area simply starts at "no access" for existing staff. */
export function areasForFlags(enabled: Record<string, boolean>): TeamArea[] {
  return TEAM_AREAS.filter((a) => a.flag === null || enabled[a.flag]);
}

/** Compose a capability key. */
export function permKey(area: string, action: AreaAction): string {
  return `${area}:${action}`;
}

/** The capability keys implied by an access level (manage implies view). */
export function levelToKeys(area: string, level: AccessLevel): string[] {
  if (level === "manage") return [permKey(area, "view"), permKey(area, "manage")];
  if (level === "view") return [permKey(area, "view")];
  return [];
}

/** Read a member's access level for an area from their stored keys. */
export function keysToLevel(perms: readonly string[], area: string): AccessLevel {
  if (perms.includes(permKey(area, "manage"))) return "manage";
  if (perms.includes(permKey(area, "view"))) return "view";
  return "none";
}

/** Can this member READ the area? Owners always can. */
export function canView(role: string, perms: readonly string[], area: string): boolean {
  return role === "owner" || perms.includes(permKey(area, "view")) || perms.includes(permKey(area, "manage"));
}

/** Can this member WRITE in the area? Owners always can. */
export function canManage(role: string, perms: readonly string[], area: string): boolean {
  return role === "owner" || perms.includes(permKey(area, "manage"));
}

/** Build a flat, sanitized permissions array from an area→level map (invite / update). */
export function permissionsFromLevels(levels: Record<string, AccessLevel>): string[] {
  return TEAM_AREAS.flatMap((a) => levelToKeys(a.key, levels[a.key] ?? "none"));
}

const VALID_KEYS = new Set(TEAM_AREAS.flatMap((a) => [permKey(a.key, "view"), permKey(a.key, "manage")]));

/** Drop unknown keys and ensure every manage implies its view. */
export function sanitizePermissions(perms: readonly string[]): string[] {
  const set = new Set(perms.filter((p) => VALID_KEYS.has(p)));
  for (const a of TEAM_AREAS) if (set.has(permKey(a.key, "manage"))) set.add(permKey(a.key, "view"));
  return [...set];
}

/** Map a sidebar nav key to the area that governs it (for nav filtering). */
export function areaForNavKey(navKey: string): TeamArea | undefined {
  return TEAM_AREAS.find((a) => a.navKeys.includes(navKey));
}
