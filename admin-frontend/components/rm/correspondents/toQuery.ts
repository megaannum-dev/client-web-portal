import { localIso } from "@/lib/chat/adapter";
import type { ChatDocumentParams } from "@/lib/api/chat";

export interface CorrespondentsUi {
  view: "all" | "in" | "out"; // Recent | Received | Sent
  from: string; // yyyy-mm-dd, "" = open
  to: string;
  senders: string[];
  q: string;
  sort: "asc" | "desc";
}

export const INITIAL_UI: CorrespondentsUi = {
  view: "all", from: "", to: "", senders: [], q: "", sort: "desc",
};

/** UI state -> API params. */
export function toQuery(ui: CorrespondentsUi): Omit<ChatDocumentParams, "cursor"> {
  const p: Omit<ChatDocumentParams, "cursor"> = { sort: ui.sort };
  if (ui.view !== "all") p.view = ui.view;
  if (ui.senders.length) p.sender = ui.senders;
  const q = ui.q.trim();
  if (q) p.q = q;
  if (ui.from) p.date_from = ui.from;
  if (ui.to) p.date_to = ui.to;
  return p;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Today" / "Yesterday" / "Mar 05, 2026", in the viewer's timezone. */
export function fmtShared(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const day = localIso(d);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (day === localIso(now)) return "Today";
  if (day === localIso(y)) return "Yesterday";
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}, ${d.getFullYear()}`;
}
