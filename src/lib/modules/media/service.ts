import { prisma } from "@/lib/db";
import type { ClientMedia } from "@prisma/client";

/** JSON-safe media item for the UI (date as ISO string). */
export interface MediaItemDTO {
  id: string;
  url: string;
  name: string | null;
  alt: string | null;
  kind: string;
  inGallery: boolean;
  createdAt: string;
}

function toDTO(m: ClientMedia): MediaItemDTO {
  return {
    id: m.id,
    url: m.url,
    name: m.name,
    alt: m.alt,
    kind: m.kind,
    inGallery: m.inGallery,
    createdAt: m.createdAt.toISOString(),
  };
}

/** A client's reusable media library, newest first. */
export async function listMedia(clientId: string): Promise<MediaItemDTO[]> {
  const rows = await prisma.clientMedia.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return rows.map(toDTO);
}

export async function addMedia(
  clientId: string,
  data: { url: string; name?: string | null; alt?: string | null; kind?: string; inGallery?: boolean },
): Promise<MediaItemDTO> {
  const created = await prisma.clientMedia.create({
    data: {
      clientId,
      url: data.url,
      name: data.name ?? null,
      alt: data.alt ?? null,
      kind: data.kind ?? "image",
      inGallery: data.inGallery ?? true,
    },
  });
  return toDTO(created);
}

/** Toggle whether an image shows in the public gallery, scoped to its owner (false if not owned). */
export async function setMediaGallery(clientId: string, id: string, inGallery: boolean): Promise<boolean> {
  const res = await prisma.clientMedia.updateMany({ where: { id, clientId }, data: { inGallery } });
  return res.count > 0;
}

/** Delete a media item, scoped to its owner (returns false if not found / not owned). */
export async function deleteMedia(clientId: string, id: string): Promise<boolean> {
  const res = await prisma.clientMedia.deleteMany({ where: { id, clientId } });
  return res.count > 0;
}
