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
  Mail, Printer, Info, X, Copy, Check,
} from "@/lib/icons";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { RequestTicket } from "@/lib/rm/tickets";
import { useRmTickets, useRmTicket } from "@/hooks/api/useRmTickets";
// ponytail: lazy dynamic import — this "use server" action pulls in server-only
// code; a static import would eagerly evaluate that chain for every consumer of
// this client component (e.g. the inbox view, which never calls it).
async function setTicketStatus(...args: Parameters<typeof import("@/app/(roles)/rm/requests/actions")["setTicketStatus"]>) {
  const { setTicketStatus: impl } = await import("@/app/(roles)/rm/requests/actions");
  return impl(...args);
}

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
  const { data } = useRmTickets();
  const tickets = data ?? [];

  const count = (f: Filter) => (f === "All" ? tickets.length : tickets.filter((t) => t.type === f).length);
  const rows = filter === "All" ? tickets : tickets.filter((t) => t.type === filter);

  const newCount = tickets.filter((t) => t.status === "New").length;
  const progCount = tickets.filter((t) => t.status === "In Progress").length;
  const closedCount = tickets.filter((t) => isClosed(t.status)).length;

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
 *  ticket, from the ticket's own real client/model ids (RmTicketDTO.client_id /
 *  model_id) -- no name-matching against fixture data. Returns null (button
 *  disabled) only when the ticket has no subscribed model, which "other"
 *  tickets never reach anyway (isTrade gates that). */
function resolveActTarget(t: RequestTicket): string | null {
  if (!isTrade(t.type) || !t.modelId) return null;
  const mode = t.type === "Redemption" ? "redemption" : "add-allotment";
  return `/rm/model-subscription?client=${t.clientId}&model=${t.modelId}&mode=${mode}`;
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

      {trade ? (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(360px,1fr)]">
          <Card title="Client Request">
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
            <div className="mt-5 border-t border-outline-variant pt-[18px]">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">Client note</div>
              <p className="text-[14.5px] leading-relaxed text-on-surface">{ticket.message}</p>
            </div>
          </Card>
          <ActOnTradePanel ticket={ticket} closed={closed} disabled={closed || !actTarget} onAct={() => actTarget && router.push(actTarget)} />
        </div>
      ) : (
        <Card title="Client Message">
          <div className="grid grid-cols-2 gap-x-7 gap-y-[18px]">
            <Fact k="Client" v={ticket.client} />
            <Fact k="Raised by" v={ticket.contact} />
            <Fact k="Reply-to" v={ticket.email} />
            <Fact k="Account" v={ticket.account} />
          </div>
          <div className="mt-5 border-t border-outline-variant pt-[18px]">
            <h3 className="text-[16px] font-bold text-on-surface">{ticket.subject}</h3>
            <p className="mt-2 text-[14.5px] leading-relaxed text-secondary">{ticket.message}</p>
          </div>
          <TicketActions ticket={ticket} closed={closed} />
        </Card>
      )}
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
  const [customNote, setCustomNote] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);
  const { refetch } = useRmTicket(ticket.ref);
  const isCustomReason = reason === "Other — add a note";
  const declineDisabled = closed || (isCustomReason && !customNote.trim());

  async function handleAct() {
    const result = await setTicketStatus(ticket.ref, { status: "in_progress" });
    if (result.success) refetch();
    else setInlineError(result.error);
    onAct();
  }

  async function handleDecline() {
    const note = isCustomReason ? customNote.trim() : (reason ?? undefined);
    const result = await setTicketStatus(ticket.ref, { status: "declined", note });
    if (result.success) refetch();
    else setInlineError(result.error);
  }

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

        <Button iconRight={ArrowRight} full disabled={disabled} onClick={handleAct}>
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
          {isCustomReason ? (
            <textarea
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              disabled={closed}
              placeholder="Add a note to the client explaining why this request can't be actioned…"
              className="mt-2.5 min-h-[48px] w-full resize-y rounded border border-outline-variant bg-white px-3.5 py-2.5 text-[13.5px] leading-relaxed text-on-surface placeholder:text-secondary disabled:cursor-not-allowed disabled:opacity-50"
            />
          ) : (
            <div className="mt-2.5 min-h-[48px] rounded border border-outline-variant bg-white px-3.5 py-2.5 text-[13.5px] leading-relaxed text-secondary">
              {reason ? `Client will see: "${reason}"` : "Add a note to the client explaining why this request can't be actioned…"}
            </div>
          )}
        </div>
        <Button variant="secondary" icon={X} full disabled={declineDisabled} onClick={handleDecline}>Decline request</Button>

        {inlineError && (
          <p className="text-[13px] font-semibold text-red-600">{inlineError}</p>
        )}

        <div className="flex items-center gap-2 text-[12px] text-secondary">
          <Mail size={14} strokeWidth={1.75} /> The client is notified by email either way.
        </div>
      </div>
    </Card>
  );
}

/* ---- action row B · other → resolve / close ------------------- */
function TicketActions({ ticket, closed }: { ticket: RequestTicket; closed: boolean }) {
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { refetch } = useRmTicket(ticket.ref);
  const resolved = closed || ticket.status === "Replied";
  // `closed` (isClosed) treats "Replied" as closed too, for the trade-ticket
  // panel's disabling logic. Replied -> Closed is still a legal transition
  // here, so Close only disables on the actually-terminal statuses.
  const trulyClosed = ticket.status === "Closed" || ticket.status === "Declined";

  async function run(status: "replied" | "closed") {
    const result = await setTicketStatus(ticket.ref, { status });
    if (result.success) refetch();
    else setInlineError(result.error);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(`[##RE ${ticket.ref}] "${ticket.subject}"`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mt-5 border-t border-outline-variant pt-[18px]">
      <div className="flex gap-2.5">
        <Button variant="secondary" icon={Copy} className="flex-1" onClick={handleCopy}>
          {copied ? "Copied!" : "Copy ticket reference"}
        </Button>
        <Button icon={Check} className="flex-1" disabled={resolved} onClick={() => run("replied")}>Resolve</Button>
        <Button variant="secondary" icon={X} className="flex-1" disabled={trulyClosed} onClick={() => run("closed")}>Close</Button>
      </div>
      {inlineError && <p className="mt-2.5 text-[13px] font-semibold text-red-600">{inlineError}</p>}
    </div>
  );
}
