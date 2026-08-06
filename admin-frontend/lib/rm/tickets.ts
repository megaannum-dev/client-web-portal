// ADM-1 — pure DTO->view mapping, no fetch logic, mirroring lib/rm/clients.ts's /
// lib/pc/models.ts's mapper convention.
// ADM-5: RequestTicket now lives here (its canonical home) rather than in
// lib/mock/rm-data.ts, which no longer has any mock ticket data to anchor it to.
// rm-data.ts re-exports it so existing `from "@/lib/mock/rm-data"` imports keep working.
import type { ChipTone } from "@/components/ui/Chip";

/** Client-raised inbox ticket (RM acts on the client's behalf). */
export type RequestTicket = {
  ref: string;
  clientId: string;
  client: string;
  contact: string;
  email: string;
  model?: string;
  modelId?: string;
  account: string;
  type: "Allotment" | "Redemption" | "Other";
  ccy: string;
  cash: string;
  mult: string;
  date: string;
  status: string;
  tone: ChipTone;
  subject?: string;
  message: string;
};

export type TicketKind = "allotment" | "redemption" | "other";
export type TicketStatus = "new" | "in_progress" | "resolved" | "declined";

export interface RmTicketDTO {
  ref: string;
  client_id: string;
  client: string;
  contact: string | null;
  email: string | null;
  account: string | null;
  model: string | null;
  model_id: string | null;
  kind: TicketKind;
  currency: string;
  amount: number | null;
  multiplier: number | null;
  subject: string | null;
  message: string;
  status: TicketStatus;
  created_at: string;
  responded_by: string | null;
  responded_at: string | null;
  response_note: string | null;
}

const KIND_LABEL: Record<TicketKind, "Allotment" | "Redemption" | "Other"> = {
  allotment: "Allotment", redemption: "Redemption", other: "Other",
};
const STATUS_LABEL: Record<TicketStatus, string> = {
  new: "New", in_progress: "In Progress", resolved: "Resolved", declined: "Declined",
};
const STATUS_TONE: Record<TicketStatus, ChipTone> = {
  new: "warm", in_progress: "review", resolved: "neutral", declined: "overdue",
};

/** Single shared source of truth for "is this ticket done" — replaces the
 *  divergent isClosed/trulyClosed (RequestTickets.tsx) and isTerminal
 *  (client-info/page.tsx) local copies. Matches STATUS_LABEL's display casing. */
export function isTerminalStatus(status: string): boolean {
  return status === "Resolved" || status === "Declined";
}

/** `180000` -> `"180,000"`, `-80000` -> `"(80,000)"` — same parens-for-negative
 *  convention as lib/rm/subscriptions.ts's allotmentToTxnRow. `null` -> "—". */
function fmtAmount(n: number | null): string {
  if (n == null) return "—";
  const abs = Math.abs(n).toLocaleString("en-US");
  return n < 0 ? `(${abs})` : abs;
}

/** `2` -> `"2×"`, `-1` -> `"−1×"`. `null` -> "—". */
function fmtMultiplier(n: number | null): string {
  if (n == null) return "—";
  return n < 0 ? `−${Math.abs(n)}×` : `${n}×`;
}

/** ISO timestamp -> `"Jun 06"`, matching the original mock ticket data's short date style. */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

/** Reshapes the wire DTO into the existing `RequestTicket` view type
 *  RequestTickets.tsx already renders — no component-side destructuring
 *  of a raw DTO, matching lib/rm/clients.ts's / lib/pc/models.ts's mapper pattern. */
export function mapDtoToRequestTicket(dto: RmTicketDTO): RequestTicket {
  return {
    ref: dto.ref,
    clientId: dto.client_id,
    client: dto.client,
    contact: dto.contact ?? "—",
    email: dto.email ?? "—",
    // model is optional on RequestTicket and RequestTicketDetail/inbox already
    // apply their own `ticket.model ?? "—"` fallback — don't pre-empt it.
    model: dto.model ?? undefined,
    modelId: dto.model_id ?? undefined,
    account: dto.account ?? "—",
    type: KIND_LABEL[dto.kind],
    ccy: dto.currency,
    cash: fmtAmount(dto.amount),
    mult: fmtMultiplier(dto.multiplier),
    date: fmtDate(dto.created_at),
    status: STATUS_LABEL[dto.status],
    tone: STATUS_TONE[dto.status],
    // subject is optional on RequestTicket, same reasoning as model — no fallback.
    subject: dto.subject ?? undefined,
    message: dto.message,
  };
}
