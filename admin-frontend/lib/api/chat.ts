// 021 U2 — chat wire DTOs + the four calls the Client Room makes.
//
// Mirrors api-backend/app/libs/chat/schemas.py exactly.
//
// NOTE this is admin-frontend's first real client-side data module. The house
// pattern is a server action over server/api-client.ts, which is `server-only`
// and reads the id_token cookie — neither works here, because a WebSocket and
// its ticket must be opened from the browser. The only existing browser fetch
// in this app is lib/auth-api.ts (login/logout); this file follows
// client-frontend/lib/api/tickets.ts's shape instead.
//
// Every call takes an explicit clientId: an ADMIN caller that omits it gets a
// 422 (service.py resolve_client_id) — only a CLIENT may default to self.

import { getApiBase } from "@/lib/auth-api";
import { downloadAuthed } from "@/lib/download";

/** Local {detail} unwrap. auth-api.ts's parseApiError is deliberately private
 *  and login-specific (it appends a "restart FastAPI" hint), and
 *  server/api-client.ts's parseErrorEnvelope is `server-only`. Neither fits a
 *  browser module, so this keeps the same shape without widening either. */
async function chatError(res: Response, methodPath: string): Promise<string> {
  let detail = res.statusText;
  try {
    const body: unknown = await res.json();
    if (typeof body === "object" && body !== null && "detail" in body) {
      const d = (body as { detail?: unknown }).detail;
      if (typeof d === "string") detail = d;
      else if (Array.isArray(d)) detail = d.map((x) => JSON.stringify(x)).join(", ");
    }
  } catch {
    /* not JSON — keep statusText */
  }
  return `${detail} (${res.status} ${methodPath})`;
}

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

/** The only frame the socket ever pushes (router.py post_message). One socket
 *  carries frames for EVERY thread this RM sits in, so consumers filter on
 *  client_id rather than assuming the frame belongs to the open room. */
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
  if (!res.ok) throw new Error(await chatError(res, `POST ${path}`));
  return (await res.json()) as WsTicket;
}

/** GET /api/chat/messages — oldest first. `since` is INCLUSIVE, so the caller
 *  must dedupe by id (which it must do anyway for the sender's own WS echo). */
export async function fetchMessages(
  token: string | null,
  { clientId, since, limit }: { clientId: string; since?: string | null; limit?: number },
): Promise<ChatMessageDTO[]> {
  const qs = new URLSearchParams({ client_id: clientId });
  if (since) qs.set("since", since);
  if (limit != null) qs.set("limit", String(limit));
  const path = `/api/chat/messages?${qs.toString()}`;
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(await chatError(res, `GET ${path}`));
  return (await res.json()) as ChatMessageDTO[];
}

/** POST /api/chat/messages — multipart. The backend requires a body OR at least
 *  one file; sending neither is a 422 the composer already prevents.
 *
 *  Content-Type is deliberately NOT set: fetch must derive it from the FormData
 *  so the multipart boundary is included. Setting it by hand breaks the parse. */
export async function sendMessage(
  token: string | null,
  { clientId, body, files = [] }: { clientId: string; body?: string | null; files?: File[] },
): Promise<ChatMessageDTO> {
  const path = "/api/chat/messages";
  const form = new FormData();
  form.append("client_id", clientId);
  if (body) form.append("body", body);
  for (const f of files) form.append("files", f, f.name);
  const res = await fetch(`${getApiBase()}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) throw new Error(await chatError(res, `POST ${path}`));
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
  await downloadAuthed(
    attachmentUrl(attachmentId),
    filename,
    token ? { Authorization: `Bearer ${token}` } : undefined,
  );
}
