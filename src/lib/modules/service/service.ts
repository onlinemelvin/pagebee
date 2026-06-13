import { prisma } from "@/lib/db";
import type { Service as ServiceModel } from "@prisma/client";
import { writeAudit } from "@/lib/modules/audit";
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
  const created = await prisma.service.create({
    data: {
      clientId,
      title: data.title,
      description: data.description ?? null,
      icon: data.icon ?? null,
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
 * already has real services, so it never duplicates an existing catalog.
 */
export async function seedServicesFromNames(clientId: string, names: string[]): Promise<void> {
  await ensureDefaultServices(clientId);
  const count = await prisma.service.count({ where: { clientId, isDefault: false } });
  if (count > 0) return;
  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 30);
  if (clean.length === 0) return;
  await prisma.service.createMany({
    data: clean.map((title, i) => ({ clientId, title, durationMinutes: 60, showOnWebsite: true, sortOrder: i })),
  });
}
