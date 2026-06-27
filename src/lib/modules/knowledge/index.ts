export {
  getKnowledge,
  setKnowledge,
  seedKnowledgeFromIntake,
  addDocument,
  deleteDocument,
  buildKbContext,
} from "./service";
export type { KnowledgeDocDTO } from "./service";
export { knowledgeDataSchema, knowledgeUpdateSchema } from "./schema";
export type { KnowledgeData, KnowledgeUpdate } from "./schema";
export { kbKindFor } from "./extract";
export type { KbKind } from "./extract";
