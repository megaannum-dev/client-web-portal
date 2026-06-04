export type PortalUser = {
  id: number;
  firebase_uid: string;
  email: string | null;
  role: "ADMIN" | "MOBO" | "RM" | "PM" | "PC" | "COMPLIANCE";
};
