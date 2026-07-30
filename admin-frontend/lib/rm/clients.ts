export interface SubscriptionDTO {
  model: string;
  status: string; // raw ModelStatus value from the backend: "live" | "draft"
  account: string | null;
}

export interface ClientListItemDTO {
  id: string;
  name: string | null;
  phone: string | null;
  assigned_rm: string | null;
  address: string | null;
  country_of_residence: string | null;
  authorized_person: string | null;
  initiate_method: string | null;
  ib_account: string | null;
  email: string | null;
  subscriptions?: SubscriptionDTO[]; // only populated on the single-client route
  id_type?: string | null;               // NEW (FE-4) — ClientListItemOut widening, §7.1
  id_number?: string | null;             // NEW (FE-4)
  authorized_by_name?: string | null;    // NEW (FE-4) — resolved display name of users.authorized_by
  // NEW — client_portfolios (011/014 C-9), only populated on the single-client
  // route. Decimal fields arrive over JSON as strings (see lib/pc/models.ts's
  // Number() coercion), null if the client predates the cash-deposit flow.
  cash_deposit?: string | null;
  amount_in_trade?: string | null;
  // NEW — "Further Information" fields, write-once-at-onboarding until now,
  // read (and now edited) via GET/PATCH /api/rm/clients/{client_id}.
  occupation?: string | null;
  anniversary?: string | null; // date as YYYY-MM-DD
  spouse_name?: string | null;
  children?: string | null;
  personal_interests?: string | null;
  communication_preferences?: string | null;
  gift_hospitality_preferences?: string | null;
  relationship_notes?: string | null;
}

/** Partial-update body for PATCH /api/rm/clients/{client_id} -- any subset of
 * these 11 fields; omitted keys are left unchanged server-side. Same
 * snake_case field names as ClientListItemDTO since this rides the wire as-is. */
export type ClientPatchReq = Partial<{
  address: string | null;
  country_of_residence: string | null;
  authorized_person: string | null;
  occupation: string | null;
  anniversary: string | null;
  spouse_name: string | null;
  children: string | null;
  personal_interests: string | null;
  communication_preferences: string | null;
  gift_hospitality_preferences: string | null;
  relationship_notes: string | null;
}>;

export interface ClientListDTO {
  items: ClientListItemDTO[];
}

/** UI-facing shape — camelCase, used by client-info/page.tsx + client-info/[id]/page.tsx. */
export interface ClientRow {
  id: string;
  name: string | null;
  phone: string | null;
  assignedRm: string | null;
  address: string | null;
  countryOfResidence: string | null;
  authorizedPerson: string | null;
  initiateMethod: string | null;
  ibAccount: string | null;
  email: string | null;
  subscriptions: SubscriptionDTO[];
  idType: string | null;             // NEW (FE-4)
  idNumber: string | null;           // NEW (FE-4)
  authorizedByName: string | null;   // NEW (FE-4)
  cashDeposit: number | null;
  amountInTrade: number | null;
  // NEW -- "Further Information" fields (see ClientListItemDTO above).
  occupation: string | null;
  anniversary: string | null;
  spouseName: string | null;
  children: string | null;
  personalInterests: string | null;
  communicationPreferences: string | null;
  giftHospitalityPreferences: string | null;
  relationshipNotes: string | null;
}

export function dtoToRow(d: ClientListItemDTO): ClientRow {
  return {
    id: d.id,
    name: d.name,
    phone: d.phone,
    assignedRm: d.assigned_rm,
    address: d.address,
    countryOfResidence: d.country_of_residence,
    authorizedPerson: d.authorized_person,
    initiateMethod: d.initiate_method,
    ibAccount: d.ib_account,
    email: d.email,
    subscriptions: d.subscriptions ?? [],
    idType: d.id_type ?? null,
    idNumber: d.id_number ?? null,
    authorizedByName: d.authorized_by_name ?? null,
    cashDeposit: d.cash_deposit != null ? Number(d.cash_deposit) : null,
    amountInTrade: d.amount_in_trade != null ? Number(d.amount_in_trade) : null,
    occupation: d.occupation ?? null,
    anniversary: d.anniversary ?? null,
    spouseName: d.spouse_name ?? null,
    children: d.children ?? null,
    personalInterests: d.personal_interests ?? null,
    communicationPreferences: d.communication_preferences ?? null,
    giftHospitalityPreferences: d.gift_hospitality_preferences ?? null,
    relationshipNotes: d.relationship_notes ?? null,
  };
}

export const dtoListToRows = (dto: ClientListDTO): ClientRow[] => dto.items.map(dtoToRow);
