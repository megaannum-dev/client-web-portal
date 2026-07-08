"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import {
  ArrowLeft, Pencil, Plus, Eye, EyeOff, Bell, Check,
  ChevronRight, Search, Clock, X,
} from "@/lib/icons";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import {
  getClientDetail,
  type ClientDoc,
  type HistoryEntry,
} from "@/lib/mock/rm-data";

const DOC_ICON: Record<string, LucideIcon> = { check: Check, clock: Clock, x: X, search: Search };

const CHECK_TINT: Record<string, string> = {
  active:  "bg-success-container text-success-on-container",
  pending: "bg-caution-container text-caution-on-container",
  overdue: "bg-error-container text-error-on-container",
  review:  "bg-surface-container text-secondary",
};

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-[7px]">
      <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">{label}</span>
      <span className="whitespace-pre-line text-[14px] leading-[1.45] text-on-surface">{value}</span>
    </div>
  );
}

function BalanceItem({ label, value, censored }: { label: string; value: string; censored: boolean }) {
  return (
    <div className="flex flex-col gap-[9px]">
      <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">{label}</span>
      <span className="text-[28px] font-bold leading-none tracking-[-0.01em] tabular-nums text-on-surface">
        {censored ? "•••••••" : value}
      </span>
    </div>
  );
}

function CheckRow({ doc, last }: { doc: ClientDoc; last: boolean }) {
  const Glyph = DOC_ICON[doc.icon] ?? Clock;
  return (
    <div className={clsx("flex items-center gap-3 py-3", !last && "border-b border-outline-variant")}>
      <span className={clsx("flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md", CHECK_TINT[doc.tone] ?? CHECK_TINT.review)}>
        <Glyph size={15} strokeWidth={2} />
      </span>
      <span className="flex-1 text-[14px] font-semibold text-on-surface">{doc.name}</span>
      <Chip tone={doc.tone} dot={false}>{doc.status}</Chip>
    </div>
  );
}

function HistoryItem({ item, last }: { item: HistoryEntry; last: boolean }) {
  const [open, setOpen] = useState(!!item.accent);
  const has = !!item.detail?.length;
  return (
    <div className="relative" style={{ paddingBottom: last ? 2 : 16 }}>
      <span
        className="absolute -left-[21px] top-[3px] h-[11px] w-[11px] rounded-full border-2"
        style={{
          background: item.accent ? "rgb(var(--color-primary))" : "rgb(var(--color-surface-lowest))",
          borderColor: item.accent ? "rgb(var(--color-primary))" : "rgb(var(--color-outline))",
        }}
      />
      <button
        type="button"
        onClick={() => has && setOpen((v) => !v)}
        className={clsx("flex w-full items-center justify-between gap-3 text-left", has ? "cursor-pointer" : "cursor-default")}
      >
        <span className="text-[14px] font-semibold text-on-surface">{item.t}</span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="whitespace-nowrap text-[12px] text-secondary">{item.d}</span>
          {has && (
            <ChevronRight
              size={14}
              strokeWidth={2}
              className="text-secondary transition-transform duration-150"
              style={{ transform: open ? "rotate(90deg)" : "none" }}
            />
          )}
        </span>
      </button>
      {has && open && (
        <div className="mt-[9px] flex flex-col gap-1.5 rounded-md bg-surface-low px-[13px] py-[11px]">
          {item.detail!.map((d, i) => (
            <span key={i} className="text-[12.5px] text-secondary">{d}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ClientDetailPage({ params }: { params: { id: string } }) {
  const result = getClientDetail(params.id);
  const [censored, setCensored] = useState(false);
  if (!result) notFound();

  const { client: c, detail: d } = result;
  const verifiedCount = d.docs.filter((x) => x.tone === "active").length;

  return (
    <div className="mx-auto max-w-[1180px]">
      <Link
        href="/rm/client-info"
        className="mb-[18px] inline-flex items-center gap-1.5 text-[13px] font-semibold text-secondary hover:text-on-surface"
      >
        <ArrowLeft size={16} strokeWidth={2} /> Back to Client Book
      </Link>

      {/* Header */}
      <div className="mb-[22px] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-[22px] font-bold"
            style={{ background: "linear-gradient(135deg,#ffd9b0,#cfd9d2)", color: "rgba(255,255,255,.92)" }}
          >
            {c.name[0]}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="whitespace-nowrap text-[26px] font-bold tracking-[-0.01em] text-on-surface">{c.name}</h1>
              <Chip tone={c.tone}>{c.status}</Chip>
            </div>
            <p className="mt-1 text-[14px] text-secondary">{c.mandate} mandate · Client since {c.since} · RM: Dana Okafor</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" icon={Pencil}>Edit profile</Button>
          <Button icon={Plus}>New Subscription</Button>
        </div>
      </div>

      {/* Client information */}
      <Card
        title="Client Information"
        className="mb-5"
        action={
          <button
            type="button"
            onClick={() => setCensored((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-secondary"
          >
            {censored ? <Eye size={16} strokeWidth={1.75} /> : <EyeOff size={16} strokeWidth={1.75} />}
            {censored ? "Show balances" : "Hide balances"}
          </button>
        }
      >
        <div className="mb-[18px] rounded-md bg-surface-low px-[18px] py-4">
          <div className="mb-3.5 text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">Account Balance</div>
          <div className="grid grid-cols-2 gap-7">
            <BalanceItem label="Total Portfolio Value" value={d.portfolioValue} censored={censored} />
            <BalanceItem label="Total Cash Value" value={d.cashValue} censored={censored} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-x-7 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          <InfoField label="Registered Address" value={d.address} />
          <InfoField label="Country of Residence" value={d.country} />
          <InfoField label="Client Since / ID" value={`${c.since} · ${d.clientId}`} />
          <InfoField label="Primary Contact" value={`${c.contact}\n${c.title}`} />
          <InfoField label="Email" value={c.email} />
          <InfoField label="Phone" value={d.phone} />
        </div>
      </Card>

      {/* Subscribed models + KYC */}
      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card title="Subscribed Models" action={<Button variant="secondary" icon={Plus}>Add</Button>}>
          {d.models.length === 0 ? (
            <p className="py-1.5 text-[14px] text-secondary">No model subscriptions yet — onboarding in progress.</p>
          ) : (
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr>
                  {["Model", "Status", "Linked Account", "Notes"].map((h) => (
                    <th key={h} className="pb-2.5 pr-3 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.models.map((m, i) => (
                  <tr key={i}>
                    <td className="border-t border-outline-variant py-3 pr-3 font-semibold text-on-surface">{m.name}</td>
                    <td className="border-t border-outline-variant py-3 pr-3"><Chip tone={m.tone}>{m.status}</Chip></td>
                    <td className="border-t border-outline-variant py-3 pr-3 tabular-nums text-on-surface">{m.account}</td>
                    <td className="border-t border-outline-variant py-3 text-secondary">{m.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card
          title="KYC & Documents"
          action={
            <Chip tone={c.kyc === "Verified" ? "active" : c.tone === "overdue" ? "overdue" : "pending"} dot={false}>
              {verifiedCount} of {d.docs.length} verified
            </Chip>
          }
        >
          {d.docs.map((doc, i) => (
            <CheckRow key={i} doc={doc} last={i === d.docs.length - 1} />
          ))}
          <div className="mt-[18px] flex gap-3">
            <Button variant="secondary" icon={Bell}>Request</Button>
            <Button icon={Check} disabled={c.kyc === "Verified"}>Approve KYC</Button>
          </div>
        </Card>
      </div>

      {/* History */}
      <Card title="History" action={<span className="text-[12px] text-secondary">{d.history.length} events</span>}>
        <div className="relative max-h-[268px] overflow-y-auto pl-[22px] pr-1.5">
          <div className="absolute left-[5px] top-1 bottom-1 w-0.5 bg-outline-variant" />
          {d.history.map((item, i) => (
            <HistoryItem key={i} item={item} last={i === d.history.length - 1} />
          ))}
        </div>
      </Card>
    </div>
  );
}
