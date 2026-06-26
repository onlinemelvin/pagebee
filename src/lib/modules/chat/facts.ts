import { prisma } from "@/lib/db";

export interface BusinessFacts {
  businessName: string;
  businessType: string | null;
  phone: string | null;
  email: string | null;
  /** Lines fed to the AI as approved facts — it may answer ONLY from these. */
  facts: string[];
}

/**
 * Load the approved facts the AI may answer from: business identity + contact, the on-site service
 * catalog, and the curated AiKnowledgeBase. Single source of truth shared by the website chat
 * (chatTurn) and the legacy sendAiReply endpoint — nothing outside this is allowed into the prompt.
 */
export async function loadBusinessFacts(clientId: string): Promise<BusinessFacts> {
  const [client, kb, services] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { businessName: true, businessType: true, ownerPhone: true, ownerEmail: true } }),
    prisma.aiKnowledgeBase.findUnique({ where: { clientId }, select: { data: true } }),
    prisma.service.findMany({ where: { clientId, showOnWebsite: true }, select: { title: true, description: true, durationMinutes: true, price: true }, take: 40 }),
  ]);

  const facts = [
    `Business: ${client?.businessName ?? "this business"}${client?.businessType ? ` (${client.businessType})` : ""}`,
    client?.ownerEmail ? `Contact email: ${client.ownerEmail}` : "",
    client?.ownerPhone ? `Contact phone: ${client.ownerPhone}` : "",
    services.length
      ? `Services: ${services.map((s) => `${s.title}${s.price != null ? ` ($${(s.price / 100).toFixed(0)})` : ""}`).join(", ")}`
      : "",
    kb?.data ? `Approved facts: ${JSON.stringify(kb.data)}` : "",
  ].filter(Boolean);

  return {
    businessName: client?.businessName ?? "this business",
    businessType: client?.businessType ?? null,
    phone: client?.ownerPhone ?? null,
    email: client?.ownerEmail ?? null,
    facts,
  };
}
