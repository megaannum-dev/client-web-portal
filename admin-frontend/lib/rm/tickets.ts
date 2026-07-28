// ADM-1 — pure DTO->view mapping, no fetch logic, mirroring lib/rm/clients.ts's /
// lib/pc/models.ts's mapper convention. Reuses the EXISTING RequestTicket type
// from lib/mock/rm-data.ts verbatim -- this file produces values of that type,
// it does not redefine it.
import type { ChipTone } from "@/components/ui/Chip";
import type { RequestTicket } from "@/lib/mock/rm-data";

export type TicketKind = "allotment" | "redemption" | "other";
export type TicketStatus = "new" | "in_progress" | "replied" | "closed" | "declined";

export interface RmTicketDTO {
  ref: string;
  client_id: string;
  client: string;
  contact: string | null;
  email: string | null;
  account: string | null;
  model: string | null;
  kind: TicketKind;
  currency: string;
  amount: number | null;
  multiplier: number | null;
  notional: number | null;
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
  new: "New", in_progress: "In Progress", replied: "Replied", closed: "Closed", declined: "Declined",
};
const STATUS_TONE: Record<TicketStatus, ChipTone> = {
  new: "warm", in_progress: "review", replied: "active", closed: "neutral", declined: "overdue",
};

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

/** ISO timestamp -> `"Jun 06"`, matching TICKET_QUEUE's short mock date style. */
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
    client: dto.client,
    contact: dto.contact ?? "—",
    email: dto.email ?? "—",
    // model is optional on RequestTicket and RequestTicketDetail/inbox already
    // apply their own `ticket.model ?? "—"` fallback — don't pre-empt it.
    model: dto.model ?? undefined,
    account: dto.account ?? "—",
    type: KIND_LABEL[dto.kind],
    ccy: dto.currency,
    cash: fmtAmount(dto.amount),
    mult: fmtMultiplier(dto.multiplier),
    notional: fmtAmount(dto.notional),
    date: fmtDate(dto.created_at),
    status: STATUS_LABEL[dto.status],
    tone: STATUS_TONE[dto.status],
    // subject is optional on RequestTicket, same reasoning as model — no fallback.
    subject: dto.subject ?? undefined,
    message: dto.message,
  };
}
