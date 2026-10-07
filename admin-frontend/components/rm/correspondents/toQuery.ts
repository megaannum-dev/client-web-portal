import { localIso } from "@/lib/chat/adapter";
import type { ChatDocumentParams } from "@/lib/api/chat";

export type DatePreset = "any" | "7" | "30" | "90" | "custom";

export interface CorrespondentsUi {
  view: "all" | "in" | "out"; // Recent | Received | Sent
  preset: DatePreset;
  from: string; // yyyy-mm-dd, custom only
  to: string;
  senders: string[];
  q: string;
  sort: "asc" | "desc";
}

export const INITIAL_UI: CorrespondentsUi = {
  view: "all", preset: "any", from: "", to: "", senders: [], q: "", sort: "desc",
};

/** UI state -> API params. Presets become a date_from here so the server only sees a range. */
export function toQuery(ui: CorrespondentsUi, today: Date): Omit<ChatDocumentParams, "cursor"> {
  const p: Omit<ChatDocumentParams, "cursor"> = { sort: ui.sort };
  if (ui.view !== "all") p.view = ui.view;
  if (ui.senders.length) p.sender = ui.senders;
  const q = ui.q.trim();
  if (q) p.q = q;
  if (ui.preset === "7" || ui.preset === "30" || ui.preset === "90") {
    const d = new Date(today);
    d.setDate(d.getDate() - Number(ui.preset));
    p.date_from = localIso(d);
  } else if (ui.preset === "custom") {
    if (ui.from) p.date_from = ui.from;
    if (ui.to) p.date_to = ui.to;
  }
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
