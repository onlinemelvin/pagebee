import { prisma } from "@/lib/db";
import type { Service as ServiceModel } from "@prisma/client";
import { writeAudit } from "@/lib/modules/audit";
import { generateServiceMeta, uniqueIcon } from "@/lib/ai/service-meta";
import { serviceInputSchema, serviceUpdateSchema } from "./schema";

export class ServiceError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

/** Title of the system catch-all every client gets (hidden from the website, not deletable). */
export const OTHER_TITLE = "Other";

// Per-client website display toggles for the services section, stored as FeatureFlags (no schema
// change). These are the explicit source of truth for whether the live site shows each service's
// price / time — overriding any per-site default. Default off (owner opts in on the Services tab).
const SHOW_PRICE_KEY = "service_show_price";
const SHOW_DURATION_KEY = "service_show_duration";

export interface ServiceDisplay {
  showPrice: boolean;
  showDuration: boolean;
}

/** The owner's "show price / show time on website" choices (default both off). */
export async function getServiceDisplay(clientId: string): Promise<ServiceDisplay> {
  const flags = await prisma.featureFlag.findMany({
    where: { clientId, key: { in: [SHOW_PRICE_KEY, SHOW_DURATION_KEY] } },
    select: { key: true, enabled: true },
  });
  const on = (key: string) => flags.find((f) => f.key === key)?.enabled === true;
  return { showPrice: on(SHOW_PRICE_KEY), showDuration: on(SHOW_DURATION_KEY) };
}

/** Update one or both website display toggles. */
export async function setServiceDisplay(
  clientId: string,
  patch: { showPrice?: boolean; showDuration?: boolean },
): Promise<ServiceDisplay> {
  const upsert = (key: string, enabled: boolean) =>
    prisma.featureFlag.upsert({
      where: { clientId_key: { clientId, key } },
      update: { enabled },
      create: { clientId, key, enabled },
    });
  await Promise.all([
    patch.showPrice !== undefined ? upsert(SHOW_PRICE_KEY, patch.showPrice) : null,
    patch.showDuration !== undefined ? upsert(SHOW_DURATION_KEY, patch.showDuration) : null,
  ].filter(Boolean) as Promise<unknown>[]);
  await writeAudit({ action: "service.display_updated", entityType: "Client", entityId: clientId, clientId });
  return getServiceDisplay(clientId);
}

export interface ServiceDTO {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  durationMinutes: number;
  price: number | null;
  showOnWebsite: boolean;
  isDefault: boolean;
  sortOrder: number;
  active: boolean;
}

function toDTO(s: ServiceModel): ServiceDTO {
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    icon: s.icon,
    durationMinutes: s.durationMinutes,
    price: s.price,
    showOnWebsite: s.showOnWebsite,
    isDefault: s.isDefault,
    sortOrder: s.sortOrder,
    active: s.active,
  };
}

const ORDER = [{ isDefault: "asc" as const }, { sortOrder: "asc" as const }, { createdAt: "asc" as const }];

/** Human label for a stored duration in minutes (e.g. 2880 → "2 days", 90 → "90 min"). */
export function serviceDurationLabel(mins: number): string {
  const DAY = 24 * 60;
  const HOUR = 60;
  if (mins > 0 && mins % DAY === 0) {
    const d = mins / DAY;
    return `${d} day${d === 1 ? "" : "s"}`;
  }
  if (mins > 0 && mins % HOUR === 0) {
    const h = mins / HOUR;
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  return `${mins} min`;
}

/** Create the system "Other" catch-all once per client. Idempotent. */
export async function ensureDefaultServices(clientId: string): Promise<void> {
  const existing = await prisma.service.findFirst({ where: { clientId, isDefault: true }, select: { id: true } });
  if (existing) return;
  await prisma.service.create({
    data: {
      clientId,
      title: OTHER_TITLE,
      description: "Anything not listed — for ad-hoc bookings and invoice line items.",
      icon: "sparkles",
      durationMinutes: 60,
      showOnWebsite: false,
      isDefault: true,
      sortOrder: 9999,
    },
  });
}

/** Full catalog for the owner's management view (real services first, "Other" last). */
export async function listServices(clientId: string): Promise<ServiceDTO[]> {
  await ensureDefaultServices(clientId);
  const rows = await prisma.service.findMany({ where: { clientId }, orderBy: ORDER });
  return rows.map(toDTO);
}

/** Services selectable when booking or invoicing — active ones, including "Other". */
export async function listBookableServices(clientId: string): Promise<ServiceDTO[]> {
  await ensureDefaultServices(clientId);
  const rows = await prisma.service.findMany({ where: { clientId, active: true }, orderBy: ORDER });
  return rows.map(toDTO);
}

/** Services shown on the public website — active, visible, excluding the "Other" default. */
export async function listWebsiteServices(clientId: string): Promise<ServiceDTO[]> {
  const rows = await prisma.service.findMany({
    where: { clientId, active: true, showOnWebsite: true, isDefault: false },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toDTO);
}

/** Map of service title → typical duration (minutes), powering the appointment timebox. */
export async function getServiceDurations(clientId: string): Promise<Map<string, number>> {
  const rows = await prisma.service.findMany({ where: { clientId, active: true }, select: { title: true, durationMinutes: true } });
  return new Map(rows.map((r) => [r.title, r.durationMinutes]));
}

export async function createService(clientId: string, input: unknown): Promise<ServiceDTO> {
  const data = serviceInputSchema.parse(input);

  // The owner now supplies only the service name; let the AI pick an icon and write a
  // business-tied description from it. Any value the caller did pass takes precedence.
  let icon = data.icon ?? null;
  let description = data.description ?? null;
  if (icon == null || description == null) {
    const [client, usedRows] = await Promise.all([
      prisma.client.findUnique({ where: { id: clientId }, select: { businessName: true, businessType: true } }),
      // Icons already on this client's catalog — so the AI pick (and the dedup backstop) don't repeat one.
      prisma.service.findMany({ where: { clientId }, select: { icon: true } }),
    ]);
    const used = new Set(usedRows.map((r) => r.icon).filter((x): x is string => Boolean(x)));
    const meta = await generateServiceMeta({
      serviceName: data.title,
      businessName: client?.businessName ?? "",
      businessType: client?.businessType ?? null,
      exclude: [...used],
    });
    // Only de-duplicate the AI-chosen icon; an explicit caller-supplied icon is respected as-is.
    if (icon == null) icon = uniqueIcon(meta.icon, used, data.title);
    description = description ?? meta.description;
  }

  const created = await prisma.service.create({
    data: {
      clientId,
      title: data.title,
      description,
      icon,
      durationMinutes: data.durationMinutes,
      price: data.price ?? null,
      showOnWebsite: data.showOnWebsite,
      sortOrder: data.sortOrder ?? 0,
    },
  });
  await writeAudit({ action: "service.created", entityType: "Service", entityId: created.id, clientId });
  return toDTO(created);
}

export async function updateService(clientId: string, id: string, input: unknown): Promise<ServiceDTO> {
  const existing = await prisma.service.findFirst({ where: { id, clientId } });
  if (!existing) throw new ServiceError(404, "not_found");
  const data = serviceUpdateSchema.parse(input);
  if (existing.isDefault) {
    // The "Other" default keeps its title and stays off the website.
    data.title = undefined;
    data.showOnWebsite = undefined;
  }
  const updated = await prisma.service.update({ where: { id }, data }); // undefined keys are left unchanged
  await writeAudit({ action: "service.updated", entityType: "Service", entityId: id, clientId });
  return toDTO(updated);
}

export async function deleteService(clientId: string, id: string): Promise<{ id: string }> {
  const existing = await prisma.service.findFirst({ where: { id, clientId }, select: { id: true, isDefault: true } });
  if (!existing) throw new ServiceError(404, "not_found");
  if (existing.isDefault) throw new ServiceError(400, "cannot_delete_default");
  await prisma.service.delete({ where: { id } });
  await writeAudit({ action: "service.deleted", entityType: "Service", entityId: id, clientId });
  return { id };
}

/**
 * Seed the catalog from the website intake's plain service names, once. Skips if the client
 * already has real services, so it never duplicates an existing catalog. Each seeded service
 * gets an AI-generated icon + business-tied description (same as the Add-service modal), so the
 * catalog isn't a wall of identical sparkles with no copy. AI runs in parallel; if it's
 * unavailable, generateServiceMeta returns a keyword-matched icon (still varied) and no description.
 */
export async function seedServicesFromNames(clientId: string, names: string[]): Promise<void> {
  await ensureDefaultServices(clientId);
  const count = await prisma.service.count({ where: { clientId, isDefault: false } });
  if (count > 0) return;
  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 30);
  if (clean.length === 0) return;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { businessName: true, businessType: true },
  });
  const metas = await Promise.all(
    clean.map((title) =>
      generateServiceMeta({
        serviceName: title,
        businessName: client?.businessName ?? "",
        businessType: client?.businessType ?? null,
      }),
    ),
  );

  // The metas were generated in parallel, so they can't see each other's icon picks — enforce
  // uniqueness across the batch here so the seeded catalog doesn't open with repeated icons.
  const taken = new Set<string>();
  await prisma.service.createMany({
    data: clean.map((title, i) => {
      const icon = uniqueIcon(metas[i].icon, taken, title);
      taken.add(icon);
      return {
        clientId,
        title,
        icon,
        description: metas[i].description,
        durationMinutes: 60,
        showOnWebsite: true,
        sortOrder: i,
      };
    }),
  });
}
