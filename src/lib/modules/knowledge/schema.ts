import { z } from "zod";

// The owner-curated, structured part of the knowledge base, stored in AiKnowledgeBase.data. Uploaded
// documents/images live in the KnowledgeDocument table; both are assembled by buildKbContext.

export const kbFaqSchema = z.object({
  q: z.string().trim().max(500),
  a: z.string().trim().max(2000),
});

export const knowledgeDataSchema = z.object({
  about: z.string().trim().max(5000).default(""),
  details: z.string().trim().max(20000).default(""),
  policies: z.string().trim().max(10000).default(""),
  faqs: z.array(kbFaqSchema).max(50).default([]),
});
export type KnowledgeData = z.infer<typeof knowledgeDataSchema>;

/** PUT payload — any subset of the structured fields. */
export const knowledgeUpdateSchema = z.object({
  about: z.string().trim().max(5000).optional(),
  details: z.string().trim().max(20000).optional(),
  policies: z.string().trim().max(10000).optional(),
  faqs: z.array(kbFaqSchema).max(50).optional(),
});
export type KnowledgeUpdate = z.infer<typeof knowledgeUpdateSchema>;
