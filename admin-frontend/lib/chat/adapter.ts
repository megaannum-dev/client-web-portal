// 021 U4 — wire DTO -> view model. Pure; no fetch, no React.
//
// Twin of client-frontend/lib/chat/adapter.ts. The two differ only where the
// view models do: admin's ChatDay carries a precomputed `label` and its
// MessageBubble formats its own time off `createdAt` (via lib/pc/format), so
// there is no per-message `time` field here.

import type { ChatAttachmentDTO, ChatMessageDTO } from "@/lib/api/chat";
import type { ChatAttachment, ChatDay, ChatMessage } from "@/components/rm/chat/types";

/** "1.4 MB". Binary units, matching the design's own sample strings. */
export function formatBytes(bytes: number | null): string {
  if (bytes == null || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // One decimal below 10 ("1.4 MB"), none above ("286 KB") — the design's mix.
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

// content_type is attacker-controlled (schemas.py marks it untrusted), so this
// only ever picks an ICON — never a renderer, and never a download disposition.
const SHEET_TYPES = new Set([
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
]);
const SHEET_EXT = new Set(["csv", "xls", "xlsx", "ods"]);
const TEXT_EXT = new Set(["txt", "md", "rtf", "doc", "docx", "odt", "pdf"]);

/** Which of the three document icons the UI has. Unknown -> "file-check",
 *  the neutral generic, matching the design's fallback tone. */
export function attachmentKind(
  contentType: string | null,
  filename: string,
): ChatAttachment["kind"] {
  const ext = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "";
  const mime = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (SHEET_TYPES.has(mime) || SHEET_EXT.has(ext)) return "sheet";
  if (mime.startsWith("text/") || mime === "application/pdf" || TEXT_EXT.has(ext)) return "file-text";
  return "file-check";
}

function toViewAttachment(dto: ChatAttachmentDTO): ChatAttachment {
  return {
    id: dto.id,
    name: dto.filename,
    kind: attachmentKind(dto.content_type, dto.filename),
    size: formatBytes(dto.size_bytes),
  };
}

/** yyyy-mm-dd in the VIEWER'S timezone — messages must group under the day the
 *  reader experienced, not the UTC day. */
export function localIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "Today" / "Yesterday" / "Fri, 18 Jul 2026" — the design's own separator
 *  wording, derived rather than baked into fixtures. `now` is injectable so a
 *  test does not depend on the wall clock. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (iso === localIso(now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (iso === localIso(yesterday)) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function toViewMessage(dto: ChatMessageDTO, ownUid: string | null): ChatMessage {
  return {
    id: dto.id,
    senderUid: dto.sender_uid,
    senderName: dto.sender_name,
    // Straight off the wire. BE-6 derives the seat server-side against the
    // client's CURRENT assignment; there is nothing to match here.
    role: dto.sender_role,
    body: dto.body,
    attachments: dto.attachments.map(toViewAttachment),
    createdAt: dto.created_at,
    own: ownUid != null && dto.sender_uid === ownUid,
  };
}

/** Group an oldest-first list into days. */
export function groupByDay(messages: ChatMessage[], now: Date = new Date()): ChatDay[] {
  const days: ChatDay[] = [];
  for (const msg of messages) {
    const iso = localIso(new Date(msg.createdAt));
    const last = days[days.length - 1];
    if (last && last.iso === iso) last.messages.push(msg);
    else days.push({ iso, label: dayLabel(iso, now), messages: [msg] });
  }
  return days;
}
