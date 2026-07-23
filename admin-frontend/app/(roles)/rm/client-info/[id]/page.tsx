"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import clsx from "clsx";
import {
  ArrowLeft, Pencil, Plus, Eye, EyeOff, Bell, Check,
  ChevronRight, Search, Clock, X, TriangleAlert, Download,
} from "@/lib/icons";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { useClient, useOnboardingByClient, useClientEvents } from "@/hooks/api/useClient";
import type { SubscriptionDTO } from "@/lib/rm/clients";
import type { DocStatus, DocumentDTO, OnboardingStatus } from "@/lib/onboarding/types";
import { COLUMN_LABELS } from "@/lib/onboarding/mappers";
import { fmtMoneyShort, fmtTimestamp } from "@/lib/pc/format";
import { type ClientDoc, type HistoryEntry } from "@/lib/mock/rm-data";

const DOC_ICON: Record<string, LucideIcon> = { check: Check, clock: Clock, x: X, search: Search, warning: TriangleAlert };

// DocStatus -> chip tone/label. Mirrors OnboardingBoard.tsx's own
// DOC_STATUS_TONE/DOC_STATUS_LABEL lookup values 1:1 (same visual mapping),
// re-declared here rather than imported since that file doesn't export them
// and is out of scope for FE-4 (owned by FE-1/2/3, edited concurrently).
// ponytail: dedupe by exporting OnboardingBoard.tsx's lookup once that file
// is next touched for an unrelated reason.
const DOC_STATUS_TONE: Record<DocStatus, ChipTone> = {
  not_started: "neutral", uploaded: "pending", in_review: "review",
  verified: "active", rejected: "failed", expired: "overdue",
};
const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  not_started: "Not started", uploaded: "Uploaded", in_review: "In review",
  verified: "Verified", rejected: "Rejected", expired: "Expired",
};
// Matches OnboardingBoard.tsx's own DOC_ICON glyph choice per tone exactly
// (Check/Clock/Clock/X/TriangleAlert/Clock) -- these two lookups must stay
// in visual lockstep even though they're declared in different files.
const DOC_ICON_KEY: Partial<Record<ChipTone, string>> = {
  active: "check", pending: "clock", review: "clock", overdue: "warning", failed: "x", neutral: "clock",
};

/** `DocumentDTO` -> the page's existing `ClientDoc` shape (FE-4). */
function docFromDto(doc: DocumentDTO): ClientDoc & { uploadedBy: string | null; uploadedAt: string | null; approvedAt: string | null } {
  const tone = DOC_STATUS_TONE[doc.status];
  return {
    name: doc.label, status: DOC_STATUS_LABEL[doc.status], tone, icon: DOC_ICON_KEY[tone] ?? "clock",
    uploadedBy: doc.uploaded_by, uploadedAt: doc.uploaded_at, approvedAt: doc.approved_at,
  };
}

// Raw ModelStatus values from the backend ("live" | "draft") -> chip label/tone.
const SUB_STATUS_LABEL: Record<string, string> = { live: "Active", draft: "In Review" };
const SUB_STATUS_TONE: Record<string, ChipTone> = { live: "active", draft: "review" };

// OnboardingStatus -> header chip tone. Labels reuse OnboardingBoard.tsx's own
// COLUMN_LABELS (lib/onboarding/mappers.ts) so the two stay in lockstep.
const ONBOARDING_STATUS_TONE: Record<OnboardingStatus, ChipTone> = {
  initial: "neutral", reviewing: "review", pending_review: "pending", active: "active",
};

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

function CheckRow({ doc, last }: { doc: ClientDoc & { uploadedBy: string | null; uploadedAt: string | null; approvedAt: string | null }; last: boolean }) {
  const Glyph = DOC_ICON[doc.icon] ?? Clock;
  return (
    <div className={clsx("flex items-center gap-3 py-3", !last && "border-b border-outline-variant")}>
      <span className={clsx("flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md", CHECK_TINT[doc.tone] ?? CHECK_TINT.review)}>
        <Glyph size={15} strokeWidth={2} />
      </span>
      <span className="flex-1 flex flex-col gap-0.5">
        <span className="text-[14px] font-semibold text-on-surface">{doc.name}</span>
        {(doc.uploadedBy || doc.uploadedAt) && (
          <span className="text-[12px] text-secondary">
            Uploaded{doc.uploadedBy ? ` by ${doc.uploadedBy}` : ""}{doc.uploadedAt ? ` on ${fmtTimestamp(doc.uploadedAt)}` : ""}
          </span>
        )}
        {doc.approvedAt && (
          <span className="text-[12px] text-secondary">Approved on {fmtTimestamp(doc.approvedAt)}</span>
        )}
      </span>
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

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, notFound: nf } = useClient(id);
  const [censored, setCensored] = useState(false);
  const { data: onboarding } = useOnboardingByClient(id);
  const { data: events } = useClientEvents(id);

  if (nf) notFound(); // Next.js 404

  if (error) {
    return (
      <div className="mx-auto max-w-[1180px] px-5 py-16 text-center text-[13px] font-medium text-error">
        {error}
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="mx-auto max-w-[1180px] px-5 py-16 text-center text-[13px] text-secondary">
        Loading…
      </div>
    );
  }

  // Real onboarding status (already fetched for the KYC card below) drives the
  // header chip instead of the mock overlay -- a client with a live subscription
  // and fully-verified KYC must not still read "In Review".
  const since = onboarding ? new Date(onboarding.created_at).getFullYear() : "—";
  const totalCashValue = data.cashDeposit;
  const totalPortfolioValue =
    data.cashDeposit != null && data.amountInTrade != null
      ? data.cashDeposit + data.amountInTrade
      : null;

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
            {data.name?.[0] ?? "?"}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="whitespace-nowrap text-[26px] font-bold tracking-[-0.01em] text-on-surface">{data.name ?? "—"}</h1>
              {onboarding && (
                <Chip tone={ONBOARDING_STATUS_TONE[onboarding.status]}>{COLUMN_LABELS[onboarding.status]}</Chip>
              )}
            </div>
            <p className="mt-1 text-[14px] text-secondary">Discretionary mandate · Client since {since} · RM: {data.assignedRm ?? "Unassigned"}</p>
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
            <BalanceItem label="Total Portfolio Value" value={totalPortfolioValue != null ? fmtMoneyShort(totalPortfolioValue) : "—"} censored={censored} />
            <BalanceItem label="Total Cash Value" value={totalCashValue != null ? fmtMoneyShort(totalCashValue) : "—"} censored={censored} />
          </div>
        </div>

        <div>
          <h4 className="mb-3.5 text-[13px] font-bold uppercase tracking-[0.05em] text-secondary">Basic Info</h4>
          <div className="grid grid-cols-1 gap-x-7 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            <InfoField label="Name" value={data.name ?? "—"} />
            <InfoField label="Primary Phone" value={data.phone ?? "—"} />
            <InfoField label="Email" value={data.email ?? "—"} />
            <InfoField label="Registered Address" value={data.address ?? "—"} />
            <InfoField label="Country of Residence" value={data.countryOfResidence ?? "—"} />
            <InfoField label="ID Info" value={[data.idType, data.idNumber].filter(Boolean).join(" ") || "—"} />
            <InfoField label="Initiate Method" value={data.initiateMethod ?? "—"} />
            <InfoField label="Assigned RM" value={data.assignedRm ?? "Unassigned"} />
            <InfoField label="Authorized Person" value={data.authorizedByName ?? "—"} />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" icon={Download}>Formation of Investment Guideline</Button>
          <Button variant="secondary" icon={Download}>Client Monthly Report</Button>
        </div>
      </Card>

      {/* Subscribed models + KYC */}
      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card title="Subscribed Models" action={<Button variant="secondary" icon={Plus}>Add</Button>}>
          {data.subscriptions.length === 0 ? (
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
                {data.subscriptions.map((s: SubscriptionDTO, i) => (
                  <tr key={i}>
                    <td className="border-t border-outline-variant py-3 pr-3 font-semibold text-on-surface">{s.model}</td>
                    <td className="border-t border-outline-variant py-3 pr-3">
                      <Chip tone={SUB_STATUS_TONE[s.status] ?? "neutral"}>{SUB_STATUS_LABEL[s.status] ?? s.status}</Chip>
                    </td>
                    <td className="border-t border-outline-variant py-3 pr-3 tabular-nums text-on-surface">{s.account ?? "—"}</td>
                    <td className="border-t border-outline-variant py-3 text-secondary">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card
          title="KYC & Documents"
          action={
            <Chip tone={onboarding && onboarding.verified_count === onboarding.required_count ? "active" : "pending"} dot={false}>
              {onboarding?.verified_count ?? 0} of {onboarding?.required_count ?? 0} verified
            </Chip>
          }
        >
          {(onboarding?.documents ?? []).length === 0 ? (
            <p className="py-1.5 text-[14px] text-secondary">No documents yet.</p>
          ) : (
            (onboarding!.documents.map((doc, i) => (
              <CheckRow key={doc.doc_type} doc={docFromDto(doc)} last={i === onboarding!.documents.length - 1} />
            )))
          )}
          {onboarding && (
            <Link
              href={`/rm/onboarding-renewal?ob=${onboarding.id}`}
              className="mt-2.5 block py-0.5 text-right text-[13px] font-semibold text-primary"
            >
              Open in Onboarding & Renewal →
            </Link>
          )}
        </Card>
      </div>

      {/* History */}
      <Card title="History" action={<span className="text-[12px] text-secondary">{(events ?? []).length} events</span>}>
        <div className="relative max-h-[268px] overflow-y-auto pl-[22px] pr-1.5">
          <div className="absolute left-[5px] top-1 bottom-1 w-0.5 bg-outline-variant" />
          {(events ?? []).map((e, i, arr) => (
            <HistoryItem
              key={e.id}
              item={{ t: e.title, d: fmtTimestamp(e.created_at), detail: [e.body] }}
              last={i === arr.length - 1}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
