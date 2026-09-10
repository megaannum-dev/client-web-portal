// 021 UI-1 — chat view-model types (presentation only, no wire types)
//
// SenderRole is a view-level concept the components key their styling off
// (avatar fill, bubble side, radius inversion, role caption). It is NOT
// derived here: BE-6 added `sender_role` to ChatMessageDTO, resolved
// server-side against the client's CURRENT assignment, so lib/chat/adapter.ts
// passes it straight through. These types stay separate from the wire ones so
// the pre-formatted display fields (`time`, `size`) have somewhere to live.

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
