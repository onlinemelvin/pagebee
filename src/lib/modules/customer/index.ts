// Public surface of the customer (CRM) module. Other modules import from here only.
export {
  createCustomer,
  listCustomers,
  customerCounts,
  getCustomer,
  updateCustomer,
  setCustomerArchived,
  deleteCustomer,
  mergeCustomers,
  upsertCustomerFromLead,
  CustomerError,
} from "./service";
export type { CustomerDTO } from "./service";
export {
  customerInputSchema,
  customerUpdateSchema,
  mergeInputSchema,
  customFieldSchema,
} from "./schema";
export type { CustomerInput, CustomerUpdate, MergeInput, CustomField } from "./schema";
