export type PortalUser = {
  firebase_uid: string;
  email: string | null;
  role: string;
};

export type ActionLevel = "urgent" | "caution" | "primary" | "info" | "neutral";
export type ActionVariant = "filled" | "outline";
export type EventCategory = "Market News" | "Account Notification" | "Requests Status" | "Others";
export type EventIconType = "trending-up" | "alarm-clock" | "file-text" | "bar-chart" | "shield" | "briefcase";
export interface EventEntry {
  id: string; iconType: EventIconType; level: ActionLevel; title: string; time: string;
  description: string; category: EventCategory; primaryLabel: string;
  primaryVariant: ActionVariant; secondaryLabel: string;
}
