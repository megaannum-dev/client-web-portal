import { ROLE_LABELS } from "@/components/compliance/ic-notes/Uploader";

/** SOP page only: the ADMIN role is presented as "Super Admin". */
export const SOP_ROLE_LABELS: Record<string, string> = { ...ROLE_LABELS, ADMIN: "Super Admin" };
