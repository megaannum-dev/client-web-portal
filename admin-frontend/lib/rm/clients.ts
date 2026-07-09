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
  };
}

export const dtoListToRows = (dto: ClientListDTO): ClientRow[] => dto.items.map(dtoToRow);
