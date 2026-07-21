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
}

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
  };
}

export const dtoListToRows = (dto: ClientListDTO): ClientRow[] => dto.items.map(dtoToRow);
