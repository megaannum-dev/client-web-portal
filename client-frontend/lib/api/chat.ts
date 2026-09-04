// 021 U1 — chat wire DTOs + the four calls the room makes.
//
// Mirrors api-backend/app/libs/chat/schemas.py exactly. The client portal never
// names a thread: `client_id` is omitted on every call and the backend defaults
// it to the caller (service.py resolve_client_id), because users.id is never
// serialised to the client wire.

import { getApiBase, parseApiError } from "@/lib/auth-api";
import { authedGet } from "@/lib/api/onboarding";
import { downloadAs } from "@/lib/downloadFile";

/** Which seat the sender occupies. Derived live server-side, never stored. */
export type SenderRole = "client" | "rm" | "assistant";

export interface ChatAttachmentDTO {
  id: string;
  filename: string;
  content_type: string | null; // untrusted — never used to pick a renderer
  size_bytes: number | null;
}

export interface ChatMessageDTO {
  id: string;
  client_id: string;
  sender_uid: string; // users.firebase_uid, NOT chat_messages.sender_id
  sender_name: string | null;
  sender_role: SenderRole;
  body: string | null;
  attachments: ChatAttachmentDTO[];
  created_at: string; // ISO
}

export interface WsTicket {
  ticket: string;
  expires_in: number;
}

/** The only frame the socket ever pushes (router.py post_message). */
export interface NewMessageFrame {
  type: "new_message";
  client_id: string;
  message: ChatMessageDTO;
}

/** POST /api/chat/ws-ticket — single-use, 30s, bound to the caller's uid. */
export async function mintWsTicket(token: string | null): Promise<WsTicket> {
  const path = "/api/chat/ws-ticket";
  const res = await fetch(`${getApiBase()}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(await parseApiError(res, `POST ${path}`));
  return (await res.json()) as WsTicket;
}

/** GET /api/chat/messages — oldest first. `since` is INCLUSIVE, so the caller
 *  must dedupe by id (which it must do anyway for the sender's own WS echo). */
export async function fetchMessages(
  token: string | null,
  opts: { since?: string | null; limit?: number } = {},
): Promise<ChatMessageDTO[]> {
  const qs = new URLSearchParams();
  if (opts.since) qs.set("since", opts.since);
  if (opts.limit != null) qs.set("limit", String(opts.limit));
  const q = qs.toString();
  return authedGet<ChatMessageDTO[]>(`/api/chat/messages${q ? `?${q}` : ""}`, token);
}

/** POST /api/chat/messages — multipart. The backend requires a body OR at least
 *  one file; sending neither is a 422 the composer already prevents.
 *
 *  Content-Type is deliberately NOT set: fetch must derive it from the FormData
 *  so the multipart boundary is included. Setting it by hand breaks the parse. */
export async function sendMessage(
  token: string | null,
  { body, files = [] }: { body?: string | null; files?: File[] },
): Promise<ChatMessageDTO> {
  const path = "/api/chat/messages";
  const form = new FormData();
  if (body) form.append("body", body);
  for (const f of files) form.append("files", f, f.name);
  const res = await fetch(`${getApiBase()}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) throw new Error(await parseApiError(res, `POST ${path}`));
  return (await res.json()) as ChatMessageDTO;
}

/** The DTO carries no download_url on purpose; it is derived from the id. */
export function attachmentUrl(attachmentId: string): string {
  return `${getApiBase()}/api/chat/attachments/${attachmentId}`;
}

/** ws:// or wss:// alongside the REST base — no separate env var to drift. */
export function chatSocketUrl(ticket: string): string {
  const base = getApiBase().replace(/^http/, "ws");
  return `${base}/api/ws/chat?ticket=${encodeURIComponent(ticket)}`;
}

/** Save one attachment. The route is Bearer-gated and always replies
 *  Content-Disposition: attachment, so this must go through fetch, not a link. */
export async function downloadAttachment(
  token: string | null,
  attachmentId: string,
  filename: string,
): Promise<void> {
  await downloadAs(
    attachmentUrl(attachmentId),
    filename,
    token ? { Authorization: `Bearer ${token}` } : undefined,
  );
}
