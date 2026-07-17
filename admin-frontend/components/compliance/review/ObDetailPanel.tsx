"use client";

import { useState } from "react";
import { Check, X, Download, Minus, FileSearch, TriangleAlert } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { DetailShell, Fact, Notice, SectionLabel, ObStatusChip } from "@/components/compliance/Shared";
import { DOC_NAMES, type DocVerdict, type Onboarding } from "@/lib/compliance/mock";

/* ---- one document row with valid/issue verdict toggle ------ */
function DocRow({
  name, verdict, onToggle,
}: {
  name: string;
  verdict: DocVerdict;
  onToggle?: (v: "valid" | "issue") => void;
}) {
  const bg = verdict === "valid" ? "#f0fdf4" : verdict === "issue" ? "#ffeceb" : "var(--surface-container)";
  const fg = verdict === "valid" ? "#15803d" : verdict === "issue" ? "#ba1a1a" : "var(--secondary)";
  const Glyph = verdict === "valid" ? Check : verdict === "issue" ? X : Minus;
  return (
    <div className="flex items-center gap-[11px] border-b border-outline-variant py-[9px]">
      <span
        className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[6px]"
        style={{ background: bg, color: fg }}
      >
        <Glyph size={13} strokeWidth={2.4} />
      </span>
      <div className="flex-1 text-[13px] font-semibold text-on-surface">{name}</div>
      <button type="button" title={`Download ${name}`} className="flex cursor-pointer p-0.5 text-secondary">
        <Download size={14} strokeWidth={2} />
      </button>
      {onToggle ? (
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onToggle("valid")}
            className="cursor-pointer rounded-[7px] px-2.5 py-[3px] text-[12px] font-bold"
            style={{
              border: verdict === "valid" ? "1.5px solid #15803d" : "1px solid var(--outline-variant)",
              background: verdict === "valid" ? "#f0fdf4" : "#fff",
              color: verdict === "valid" ? "#15803d" : "var(--secondary)",
            }}
          >
            Valid
          </button>
          <button
            type="button"
            onClick={() => onToggle("issue")}
            className="cursor-pointer rounded-[7px] px-2.5 py-[3px] text-[12px] font-bold"
            style={{
              border: verdict === "issue" ? "1.5px solid #ba1a1a" : "1px solid var(--outline-variant)",
              background: verdict === "issue" ? "#ffeceb" : "#fff",
              color: verdict === "issue" ? "#ba1a1a" : "var(--secondary)",
            }}
          >
            Issue
          </button>
        </div>
      ) : verdict === "valid" ? (
        <Chip tone="active" dot={false}>Valid</Chip>
      ) : verdict === "issue" ? (
        <Chip tone="failed" dot={false}>Issue</Chip>
      ) : (
        <span className="text-[12px] italic text-secondary">Not reviewed</span>
      )}
    </div>
  );
}

/* ---- approve button; tooltip only shows on hover while disabled ---- */
function ApproveButton({
  canApprove, allReviewed, onApprove,
}: {
  canApprove: boolean;
  allReviewed: boolean;
  onApprove: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Button
        icon={Check}
        onClick={canApprove ? onApprove : undefined}
        style={{ opacity: canApprove ? 1 : 0.45, cursor: canApprove ? "pointer" : "not-allowed" }}
      >
        Approve
      </Button>
      {!canApprove && hover && (
        <div
          className="pointer-events-none absolute right-0 whitespace-nowrap rounded-[7px] px-2.5 py-[5px] text-[11.5px] font-semibold text-white"
          style={{ bottom: "calc(100% + 6px)", background: "var(--on-surface)" }}
        >
          {!allReviewed ? "Review all documents first" : "Resolve flagged documents"}
        </div>
      )}
    </div>
  );
}

export function ObDetailPanel({
  o, onClose, onApprove, onReject, verdicts, onVerdict,
}: {
  o: Onboarding;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  verdicts: DocVerdict[];
  onVerdict: (idx: number, v: DocVerdict) => void;
}) {
  const pending = o.status === "pending";
  const reviewed = verdicts.filter((v) => v !== null).length;
  const issues = verdicts.filter((v) => v === "issue").length;
  const allReviewed = reviewed === verdicts.length;
  const hasIssue = issues > 0;
  const canApprove = pending && allReviewed && !hasIssue;
  return (
    <DetailShell
      eyebrow="Onboarding review"
      title={o.client}
      meta={`${o.rm} · ${o.submitted} · ${o.type}`}
      statusSlot={<ObStatusChip status={o.status} />}
      onClose={onClose}
    >
      {o.status === "rejected" && (
        <div className="mb-4">
          <Notice tone="bad" icon={X}>
            <b>Rejected</b> — {o.rejectReason || "No reason provided."}
          </Notice>
        </div>
      )}
      <div className="grid grid-cols-2 gap-[11px]">
        <Fact k="Email" v={o.email} vSize={13} />
        <Fact k="Phone" v={o.phone} vSize={13} />
        <Fact k="IBHK Account" v={o.ibhk} vSize={14} />
        <Fact k="Silverwate Account" v={o.silverwate} vSize={14} />
      </div>
      <div className="mt-5">
        <SectionLabel>Required documents ({reviewed}/{verdicts.length} reviewed)</SectionLabel>
        {pending && !allReviewed && !hasIssue && (
          <div className="mb-3">
            <Notice tone="info" icon={FileSearch}>
              Review each document and mark it <b>Valid</b> or <b>Issue</b> before approving or rejecting.
            </Notice>
          </div>
        )}
        {pending && hasIssue && (
          <div className="mb-3">
            <Notice tone="warn" icon={TriangleAlert}>
              <b>{issues} document{issues > 1 ? "s" : ""} flagged</b> — cannot approve until all issues are resolved.
            </Notice>
          </div>
        )}
        <div className="border-t border-outline-variant">
          {DOC_NAMES.map((n, i) => (
            <DocRow
              key={i}
              name={n}
              verdict={verdicts[i]}
              onToggle={pending ? (v) => onVerdict(i, verdicts[i] === v ? null : v) : undefined}
            />
          ))}
        </div>
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        {pending ? (
          <>
            {hasIssue && <Button variant="secondary" icon={X} onClick={() => onReject(o.id)}>Reject</Button>}
            <ApproveButton canApprove={canApprove} allReviewed={allReviewed} onApprove={() => onApprove(o.id)} />
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-secondary">
            {o.status === "approved" ? <Check size={15} strokeWidth={2} /> : <X size={15} strokeWidth={2} />}
            {o.status === "approved" ? "Approved" : "Rejected"}
          </span>
        )}
      </div>
    </DetailShell>
  );
}
