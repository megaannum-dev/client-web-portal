export type PortalUser = {
  id: number;
  firebase_uid: string;
  email: string | null;
  role: "CLIENT" | "RM" | "PM" | "PC" | "COMPLIANCE" | "ADMIN";
};
