import type { GrantMap } from "@/lib/pages-config";

export type PortalUser = {
  firebase_uid: string;
  email: string | null;
  name: string | null;
  role: "ADMIN" | "MOBO" | "RM" | "PM" | "PC" | "COMPLIANCE";
  /** Server-resolved effective access per §4.1 `UserOut.grants`; an absent key is NONE.
   *  Optional in the type only so a not-yet-deployed backend does not crash the client —
   *  the hook's `?? "NONE"` makes a missing map grant nothing. */
  grants?: GrantMap;
};
