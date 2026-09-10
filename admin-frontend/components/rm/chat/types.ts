// 021 UI-3 — chat view-level types (RM Client Room panel)
//
// SenderRole/Participant/ChatMessage are VIEW-LEVEL types the components
// consume. They deliberately do not mirror the wire contract: the committed
// `ChatMessageDTO` (api-backend/app/libs/chat/schemas.py) carries only
// `sender_uid` / `sender_name` / `sender_is_staff` — one boolean, so an RM
// and an Assistant RM are identical on the wire. The wiring branch derives
// `role` (most likely by matching `senderUid` against the client's
// `assigned_rm_uid` / `asst_rm_uid`) or asks the backend for a role field.
// Do not collapse these three roles to two to match the DTO.

export type SenderRole = "client" | "rm" | "assistant";

/** One member of the room. The stack is 2 or 3 entries, never a fixed 3 —
 *  `client_profiles.asst_rm_uid` is nullable, so a two-party room is real. */
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
  createdAt: string; // ISO
  own?: boolean; // senderUid === current user
}

export interface ChatDay {
  iso: string; // yyyy-mm-dd
  label: string; // e.g. "Fri, 18 Jul 2026" — derived by dayLabel(), never stored as data
  messages: ChatMessage[];
}

/** Meta-line role label, e.g. "Relationship Manager · 16:08". */
export const CR_ROLE: Record<SenderRole, string> = {
  client: "Client",
  rm: "Relationship Manager",
  assistant: "Assistant RM",
};
