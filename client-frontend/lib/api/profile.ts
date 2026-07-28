import { authedGet, authedPatch } from "@/lib/api/onboarding";

export interface RmContactDTO { name: string | null; email: string | null; phone: string | null; }

export interface ClientProfileDTO {
  name: string | null;
  email: string | null;
  phone: string | null;
  occupation: string | null;
  date_of_birth: string | null; // "YYYY-MM-DD"; read-only — never sent in ClientProfilePatch
  address: string | null;
  country_of_residence: string | null;
  ib_account: string | null;
  client_ref: string;
  assigned_rm: RmContactDTO | null;
}

export interface ClientProfilePatch {
  name?: string;
  occupation?: string;
  address?: string;
  country_of_residence?: string;
  // date_of_birth is deliberately NOT a member of this type — the backend
  // 422s if it's sent (D-11); there is no code path in this unit that could
  // construct a patch object containing it.
}

/** GET /api/client/profile */
export async function fetchProfile(token: string | null): Promise<ClientProfileDTO> {
  return authedGet<ClientProfileDTO>("/api/client/profile", token);
}

/** PATCH /api/client/profile */
export async function patchProfile(token: string | null, patch: ClientProfilePatch): Promise<ClientProfileDTO> {
  return authedPatch<ClientProfileDTO>("/api/client/profile", token, patch);
}
