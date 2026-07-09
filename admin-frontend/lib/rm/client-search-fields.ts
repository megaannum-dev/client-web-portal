import type { ClientRow } from "@/lib/rm/clients";

export type AdvField = {
  key: string;
  label: string;
  placeholder: string;
  /** UI-side accessor: reads the searchable string off a ClientRow. */
  get: (c: ClientRow) => string;
};

/** Advanced-search fields for the RM Client Book — exactly the §7 wire fields
 *  minus the opaque `id`. Adding a searchable field is a one-line addition here. */
export const ADV_FIELDS: readonly AdvField[] = [
  { key: "name",                 label: "Name",             placeholder: "e.g. Ardent Capital",     get: (c) => c.name ?? "" },
  { key: "phone",                label: "Phone",            placeholder: "e.g. +44 20 7946",         get: (c) => c.phone ?? "" },
  { key: "assigned_rm",          label: "Assigned RM",      placeholder: "e.g. Dana Okafor",         get: (c) => c.assignedRm ?? "" },
  { key: "address",              label: "Address",          placeholder: "e.g. Battery Street",      get: (c) => c.address ?? "" },
  { key: "country_of_residence", label: "Country",          placeholder: "e.g. United States",       get: (c) => c.countryOfResidence ?? "" },
  { key: "authorized_person",    label: "Authorized Person", placeholder: "e.g. Helena Voss",        get: (c) => c.authorizedPerson ?? "" },
  { key: "initiate_method",      label: "Initiate Method",  placeholder: "e.g. Referral",            get: (c) => c.initiateMethod ?? "" },
  { key: "ib_account",           label: "IB Account",       placeholder: "e.g. IB-4471",             get: (c) => c.ibAccount ?? "" },
  { key: "email",                label: "Email",            placeholder: "e.g. @harlowfo.com",       get: (c) => c.email ?? "" },
] as const;
