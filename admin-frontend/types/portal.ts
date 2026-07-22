export type PortalUser = {
  firebase_uid: string;
  email: string | null;
  name: string | null;
  role: "ADMIN" | "MOBO" | "RM" | "PM" | "PC" | "COMPLIANCE";
};
