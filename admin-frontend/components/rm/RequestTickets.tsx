"use client";

/* ============================================================
   RM · Request Tickets
   Inbox of tickets raised BY CLIENTS. The RM receives each ticket
   and acts on the client's behalf:
     • Allotment / Redemption → "Act on request" opens Model
       Subscription pre-filled to execute it (or decline w/ reason).
     • Other                  → compose a reply; client is notified
       by email either way.
   Ported from the design handoff (Requests.jsx) into this repo's
   Tailwind + TypeScript conventions.
   ============================================================ */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import {
  Inbox, Loader2, CheckCheck, ChevronRight, ChevronDown,
  ArrowDownToLine, ArrowUpFromLine, ArrowLeft, ArrowRight,
  Mail, Printer, Info, X, Send, Paperclip,
} from "@/lib/icons";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TICKET_QUEUE, SUB_CLIENTS, type RequestTicket } from "@/lib/mock/rm-data";

/* ---- shared type meta (icon + tint per ticket type) ---------- */
const TYPE_META: Record<RequestTicket["type"], { icon: LucideIcon; bg: string; fg: string }> = {
  Allotment:  { icon: ArrowDownToLine, bg: "#e3f1e7", fg: "#2f7a47" },
  Redemption: { icon: ArrowUpFromLine, bg: "#fff3e8", fg: "#994700" },
  Other:      { icon: Mail,            bg: "#eef2f7", fg: "#585f6c" },
};

const isTrade = (type: RequestTicket["type"]) => type === "Allotment" || type === "Redemption";
const isClosed = (status: string) => status === "Closed" || status === "Declined" || status === "Replied";

function TypeCell({ type }: { type: RequestTicket["type"] }) {
  const m = TYPE_META[type];
  const Icon = m.icon;
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md"
        style={{ background: m.bg, color: m.fg }}
      >
        <Icon size={14} strokeWidth={2} />
      </span>
      <span className="font-semibold text-on-surface">{type}</span>
    </span>
  );
}

/* ============================================================
   1 · Inbox — requests received from clients
   ============================================================ */
const FILTERS = ["All", "Allotment", "Redemption", "Other"] as const;
type Filter = (typeof FILTERS)[number];

const COLS = ["Ref", "Client", "Request", "Subject / Model", "Amount", "Received", "Status"];
const RIGHT = new Set(["Amount"]);

export function RequestTicketsInbox() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("All");

  const count = (f: Filter) => (f === "All" ? TICKET_QUEUE.length : TICKET_QUEUE.filter((t) => t.type === f).length);
  const rows = filter === "All" ? TICKET_QUEUE : TICKET_QUEUE.filter((t) => t.type === filter);

  const newCount = TICKET_QUEUE.filter((t) => t.status === "New").length;
  const progCount = TICKET_QUEUE.filter((t) => t.status === "In Progress").length;
  const closedCount = TICKET_QUEUE.filter((t) => isClosed(t.status)).length;

  const STATS: { label: string; value: number; sub: string; icon: LucideIcon }[] = [
    { label: "Needs action", value: newCount, sub: "new from clients", icon: Inbox },
    { label: "In progress", value: progCount, sub: "being actioned", icon: Loader2 },
    { label: "Closed", value: closedCount, sub: "resolved tickets", icon: CheckCheck },
  ];

  return (
    <div>
      {/* status strip */}
      <div className="mb-5 flex flex-wrap gap-4">
        {STATS.map((s) => (
          <div
            key={s.label}
            className="flex min-w-[200px] flex-1 items-center gap-3.5 rounded-lg border border-outline-variant bg-surface-lowest px-[18px] py-4 shadow-card"
          >
            <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <s.icon size={19} strokeWidth={1.75} />
            </span>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-[26px] font-bold tracking-[-0.02em] tabular-nums text-on-surface">{s.value}</span>
                <span className="text-[12px] text-secondary">{s.sub}</span>
              </div>
              <div className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
        {/* filter pills */}
        <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant px-5 py-3.5">
          {FILTERS.map((f) => {
            const on = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors duration-150",
                  on ? "border-primary bg-primary text-white" : "border-outline-variant bg-white text-secondary hover:bg-surface-container",
                )}
              >
                {f}
                <span className={clsx("rounded-full px-1.5 text-[12px] font-bold", on ? "bg-white/25 text-white" : "bg-surface-container text-secondary")}>
                  {count(f)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr>
                {COLS.map((c) => (
                  <th
                    key={c}
                    className={clsx(
                      "whitespace-nowrap bg-surface-low px-[18px] py-3 text-[11px] font-bold uppercase tracking-[0.05em] text-secondary",
                      RIGHT.has(c) ? "text-right" : "text-left",
                    )}
                  >
                    {c}
                  </th>
                ))}
                <th className="w-11 bg-surface-low" />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr
                  key={t.ref}
                  onClick={() => router.push(`/rm/requests/${t.ref}`)}
                  className="group cursor-pointer transition-colors duration-100 hover:bg-surface-container"
                >
                  <td className="whitespace-nowrap border-t border-outline-variant px-[18px] py-[13px] font-bold tabular-nums text-on-surface">{t.ref}</td>
                  <td className="border-t border-outline-variant px-[18px] py-[13px]">
                    <div className="font-semibold text-on-surface">{t.client}</div>
                    <div className="mt-0.5 text-[12px] text-secondary">{t.contact}</div>
                  </td>
                  <td className="border-t border-outline-variant px-[18px] py-[13px]"><TypeCell type={t.type} /></td>
                  <td className="border-t border-outline-variant px-[18px] py-[13px] text-secondary">{t.type === "Other" ? t.subject : t.model}</td>
                  <td className="border-t border-outline-variant px-[18px] py-[13px] text-right tabular-nums text-on-surface">
                    {t.cash === "—" ? "—" : `${t.ccy} ${t.cash}`}
                  </td>
                  <td className="border-t border-outline-variant px-[18px] py-[13px] text-secondary">{t.date}</td>
                  <td className="border-t border-outline-variant px-[18px] py-[13px]"><Chip tone={t.tone} dot={false}>{t.status}</Chip></td>
                  <td className="border-t border-outline-variant px-3.5 py-[13px] text-right text-secondary group-hover:text-primary">
                    <ChevronRight size={16} strokeWidth={2} className="ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   2 · Ticket detail — request facts + RM action panel
   ============================================================ */
function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">{k}</div>
      <div className="text-[15px] font-semibold tabular-nums text-on-surface">{v}</div>
    </div>
  );
}

/** Resolves the pre-filled Model Subscription URL for an Allotment/Redemption
 *  ticket, matching the receiving contract on /rm/model-subscription. Returns
 *  null (button disabled) if the client/model can't be found in SUB_CLIENTS —
 *  this is mock data so most tickets resolve, but we don't assume all do. */
function resolveActTarget(t: RequestTicket): string | null {
  if (!isTrade(t.type)) return null;
  const client = SUB_CLIENTS.find((c) => c.name === t.client);
  if (!client) return null;
  const modelIndex = client.models.findIndex((m) => m.name === t.model);
  if (modelIndex === -1) return null;
  const mode = t.type === "Redemption" ? "redemption" : "add-allotment";
  return `/rm/model-subscription?client=${client.id}&model=${modelIndex}&mode=${mode}`;
}

export function RequestTicketDetail({ ticket }: { ticket: RequestTicket }) {
  const router = useRouter();
  const m = TYPE_META[ticket.type];
  const Icon = m.icon;
  const trade = isTrade(ticket.type);
  const closed = isClosed(ticket.status);
  const actTarget = resolveActTarget(ticket);

  return (
    <div>
      <Link
        href="/rm/requests"
        className="mb-[18px] inline-flex items-center gap-1.5 text-[13px] font-semibold text-secondary hover:text-on-surface"
      >
        <ArrowLeft size={16} strokeWidth={2} /> Back to Request Tickets
      </Link>

      {/* header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md"
            style={{ background: m.bg, color: m.fg }}
          >
            <Icon size={22} strokeWidth={1.75} />
          </span>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-[26px] font-bold tracking-[-0.01em] tabular-nums text-on-surface">{ticket.ref}</h1>
              <Chip tone={ticket.tone} dot={false}>{ticket.status}</Chip>
            </div>
            <p className="mt-1 text-[14px] text-secondary">
              {ticket.type} request · raised by <b className="text-on-surface">{ticket.contact}</b> · {ticket.client} · received {ticket.date}
            </p>
          </div>
        </div>
        <Button variant="secondary" icon={Printer}>Print</Button>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(360px,1fr)]">
        {/* left — what the client asked for */}
        <Card title={trade ? "Client Request" : "Client Message"}>
          {trade ? (
            <div className="grid grid-cols-2 gap-x-7 gap-y-[18px]">
              <Fact k="Client" v={ticket.client} />
              <Fact k="Raised by" v={ticket.contact} />
              <Fact k="Subscribed model" v={ticket.model ?? "—"} />
              <Fact k="IB account" v={ticket.account} />
              <Fact k="Request type" v={ticket.type} />
              <Fact k="Cash amount" v={`${ticket.ccy} ${ticket.cash}`} />
              <Fact k="Model multiple" v={ticket.mult} />
              <Fact k="Notional" v={`${ticket.ccy} ${ticket.notional}`} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-7 gap-y-[18px]">
              <Fact k="Client" v={ticket.client} />
              <Fact k="Raised by" v={ticket.contact} />
              <Fact k="Reply-to" v={ticket.email} />
              <Fact k="Account" v={ticket.account} />
            </div>
          )}
          <div className="mt-5 border-t border-outline-variant pt-[18px]">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">{trade ? "Client note" : ticket.subject}</div>
            <p className="text-[14.5px] leading-relaxed text-on-surface">{ticket.message}</p>
          </div>
        </Card>

        {/* right — the RM action panel */}
        {trade
          ? <ActOnTradePanel ticket={ticket} closed={closed} disabled={closed || !actTarget} onAct={() => actTarget && router.push(actTarget)} />
          : <ReplyPanel ticket={ticket} closed={closed} />}
      </div>
    </div>
  );
}

/* ---- action panel A · allotment / redemption ------------------ */
const DECLINE_REASONS = [
  "Insufficient documentation",
  "Amount exceeds mandate limit",
  "Pending compliance review",
  "Other — add a note",
];

function ActOnTradePanel({
  ticket, closed, disabled, onAct,
}: {
  ticket: RequestTicket;
  closed: boolean;
  disabled: boolean;
  onAct: () => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [reasonOpen, setReasonOpen] = useState(false);

  return (
    <Card title="Act on Request">
      <div className="flex flex-col gap-4">
        <div className="rounded-md bg-surface-low px-[18px] py-4">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">Requested {ticket.type.toLowerCase()}</div>
          <div className="text-[28px] font-bold tracking-[-0.02em] tabular-nums text-on-surface">{ticket.ccy} {ticket.notional}</div>
          <div className="mt-1 text-[13px] text-secondary">{ticket.model} · {ticket.account}</div>
        </div>

        <div className="flex items-start gap-2 text-[13px] leading-relaxed text-secondary">
          <Info size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span>
            Acting opens <b className="text-on-surface">Model Subscription</b>, pre-filled with these details, so you can execute the {ticket.type.toLowerCase()} on the client&apos;s behalf.
          </span>
        </div>

        <Button iconRight={ArrowRight} full disabled={disabled} onClick={onAct}>
          Act on request — open Model Subscription
        </Button>

        <div className="h-px bg-outline-variant" />

        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">Or decline with a reason</div>
          <button
            type="button"
            onClick={() => setReasonOpen((v) => !v)}
            disabled={closed}
            className="flex w-full items-center justify-between gap-2 rounded border border-outline bg-white px-3.5 py-2.5 text-[14px] text-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className={reason ? "text-on-surface" : undefined}>{reason ?? "Select a reason…"}</span>
            <ChevronDown size={16} strokeWidth={2} />
          </button>
          {reasonOpen && !closed && (
            <div className="mt-1.5 overflow-hidden rounded border border-outline-variant bg-white">
              {DECLINE_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => { setReason(r); setReasonOpen(false); }}
                  className="block w-full px-3.5 py-2 text-left text-[13.5px] text-on-surface hover:bg-surface-low"
                >
                  {r}
                </button>
              ))}
            </div>
          )}
          <div className="mt-2.5 min-h-[48px] rounded border border-outline-variant bg-white px-3.5 py-2.5 text-[13.5px] leading-relaxed text-secondary">
            Add a note to the client explaining why this request can&apos;t be actioned…
          </div>
        </div>
        <Button variant="secondary" icon={X} full disabled={closed}>Decline request</Button>

        <div className="flex items-center gap-2 text-[12px] text-secondary">
          <Mail size={14} strokeWidth={1.75} /> The client is notified by email either way.
        </div>
      </div>
    </Card>
  );
}

/* ---- action panel B · other → email reply ---------------------- */
function ReplyPanel({ ticket, closed }: { ticket: RequestTicket; closed: boolean }) {
  const firstName = ticket.contact.split(" ")[0];
  return (
    <Card title="Reply to Client">
      <div className="flex flex-col gap-3.5">
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">To</div>
          <div className="flex items-center gap-2 rounded border border-outline bg-white px-3.5 py-2.5 text-[14px] text-secondary">
            <Mail size={15} strokeWidth={1.75} />
            <span className="font-semibold text-on-surface">{ticket.contact}</span>
            <span>&lt;{ticket.email}&gt;</span>
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">Subject</div>
          <div className="rounded border border-outline bg-white px-3.5 py-2.5 text-[14px] font-semibold text-on-surface">Re: {ticket.subject}</div>
        </div>
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">Message</div>
          <div className="min-h-[156px] rounded border border-outline bg-white px-3.5 py-3 text-[14px] leading-relaxed text-on-surface">
            Hi {firstName},<br /><br />
            Thanks for getting in touch regarding &ldquo;{ticket.subject?.toLowerCase()}&rdquo;.<br /><br />
            <span className="text-secondary">Type your reply here — this will be sent to the client by email and logged against the ticket…</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-secondary">
          <Paperclip size={14} strokeWidth={1.75} /> Attach a document
        </div>
        <div className="flex gap-2.5">
          <Button variant="secondary" className="flex-1" disabled={closed}>Save draft</Button>
          <Button icon={Send} className="flex-1" disabled={closed}>Send email</Button>
        </div>
        <div className="flex items-center gap-2 rounded-md bg-[#fff3e8] px-3 py-2 text-[12px] font-semibold text-[#994700]">
          <Mail size={14} strokeWidth={2} /> Sends to {ticket.email}; ticket is marked Replied.
        </div>
      </div>
    </Card>
  );
}
