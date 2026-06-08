// Public surface of the lead module. Other modules import from here only.
export { createLead, listLeads, updateLead } from "./service";
export type { CreateLeadParams } from "./service";
export { leadInputSchema, leadUpdateSchema, LEAD_STATUSES } from "./schema";
export type { LeadInput, LeadUpdateInput } from "./schema";
