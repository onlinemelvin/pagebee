import { prisma } from "@/lib/db";

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "site";
}

/** A client slug guaranteed unique against existing tenants. */
export async function uniqueClientSlug(businessName: string): Promise<string> {
  const base = slugify(businessName);
  let slug = base;
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await prisma.client.findUnique({ where: { slug }, select: { id: true } });
    if (!existing) return slug;
    slug = `${base}-${Math.floor(1000 + Math.random() * 9000)}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}
