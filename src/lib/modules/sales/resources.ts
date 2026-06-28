import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/modules/audit";
import { SalesError } from "./errors";
import { resourceInputSchema } from "./schema";

/**
 * Rep enablement hub, backed by `InternalDocument`. Rep resources are namespaced by a `rep:<group>`
 * category so they coexist with other internal docs; the group is the bit after the prefix
 * (e.g. "rep:Product 101"). Admins curate; reps read. See docs/SALES_REP_PROGRAM.md §8.
 */

const PREFIX = "rep:";

export interface ResourceItem {
  id: string;
  title: string;
  url: string;
  group: string;
  createdAt: string;
}
export interface ResourceGroup {
  group: string;
  items: ResourceItem[];
}

/** All rep resources, grouped by their category group, groups and items alphabetised. */
export async function listRepResources(): Promise<ResourceGroup[]> {
  const docs = await prisma.internalDocument.findMany({
    where: { category: { startsWith: PREFIX } },
    orderBy: { createdAt: "desc" },
  });

  const byGroup = new Map<string, ResourceItem[]>();
  for (const d of docs) {
    const group = (d.category ?? PREFIX).slice(PREFIX.length) || "General";
    const items = byGroup.get(group) ?? [];
    items.push({ id: d.id, title: d.title, url: d.url, group, createdAt: d.createdAt.toISOString() });
    byGroup.set(group, items);
  }

  return [...byGroup.entries()]
    .map(([group, items]) => ({ group, items: items.sort((a, b) => a.title.localeCompare(b.title)) }))
    .sort((a, b) => a.group.localeCompare(b.group));
}

/** Add a rep resource (admin). */
export async function createRepResource(input: unknown, actor?: { userId?: string }) {
  const parsed = resourceInputSchema.parse(input);
  const doc = await prisma.internalDocument.create({
    data: { title: parsed.title, url: parsed.url, category: `${PREFIX}${parsed.group}` },
  });
  await writeAudit({
    action: "rep_resource.created",
    entityType: "InternalDocument",
    entityId: doc.id,
    actorId: actor?.userId ?? null,
    metadata: { group: parsed.group },
  });
  return doc;
}

/** Remove a rep resource (admin). Refuses to touch non-rep internal docs. */
export async function deleteRepResource(id: string, actor?: { userId?: string }) {
  const doc = await prisma.internalDocument.findUnique({ where: { id }, select: { id: true, category: true } });
  if (!doc || !doc.category?.startsWith(PREFIX)) throw new SalesError("resource_not_found", 404);
  await prisma.internalDocument.delete({ where: { id } });
  await writeAudit({ action: "rep_resource.deleted", entityType: "InternalDocument", entityId: id, actorId: actor?.userId ?? null });
  return { ok: true };
}
