// 021 UI-1 — chat view-model types (presentation only, no wire types)
//
// SenderRole is a view-level concept the components key their styling off
// (avatar fill, bubble side, radius inversion, role caption). The committed
// wire contract (ChatMessageDTO) carries only sender_is_staff — one boolean —
// so it cannot distinguish "rm" from "assistant". Deriving `role` from the
// DTO is the wiring branch's job; these types just keep the two shapes apart
// so that derivation has somewhere to land.

export type SenderRole = "client" | "rm" | "assistant";

export interface Participant {
  uid: string;
  name: string | null;
  role: SenderRole;
}

export interface ChatAttachment {
  id: string;
  name: string;
  kind: "file-text" | "sheet" | "file-check";
  size: string; // pre-formatted, e.g. "1.4 MB"
}

export interface ChatMessage {
  id: string;
  senderUid: string;
  senderName: string | null;
  role: SenderRole;
  body: string | null;
  attachments: ChatAttachment[];
  createdAt: string; // ISO timestamp
  own?: boolean; // senderUid === current user
  time: string; // pre-formatted display time, e.g. "11:40"
}

export interface ChatDay {
  iso: string; // yyyy-mm-dd
  msgs: ChatMessage[];
}
