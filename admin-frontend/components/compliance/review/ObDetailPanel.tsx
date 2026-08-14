"use client";

import { useState } from "react";
import { Check, X, Download, Minus, FileSearch, TriangleAlert, RefreshCw, Mail } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { DetailShell, Fact, Notice, SectionLabel, ObStatusChip } from "@/components/compliance/Shared";
import { useCanEdit } from "@/hooks/usePageAccess";
import { todayLabel } from "@/lib/admin/today";
import type { AdminOnboardingRow, DocumentDTO, DocVerdict } from "@/lib/onboarding/types";

/** decidedAt is a raw ISO instant off the wire; the design shows "07 Jul 2026".
 *  todayLabel is a pure Date -> "dd Mon yyyy" formatter despite its name, so
 *  reuse it rather than inlining a fifth copy of that toLocaleDateString call. */
function decidedLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : todayLabel(d);
}

/* ---- one document row with valid/issue verdict toggle ------ */
function DocRow({
  doc, verdict, requested, onToggle, onDownload,
}: {
  doc: DocumentDTO;
  verdict: DocVerdict;
  /** Compliance already asked for this one again — outranks any verdict. */
  requested: boolean;
  onToggle?: (v: "valid" | "issue") => void;
  onDownload: () => void;
}) {
  const bg = requested ? "#fff3e8" : verdict === "valid" ? "#f0fdf4" : verdict === "issue" ? "#ffeceb" : "var(--surface-container)";
  const fg = requested ? "#994700" : verdict === "valid" ? "#15803d" : verdict === "issue" ? "#ba1a1a" : "var(--secondary)";
  const Glyph = requested ? RefreshCw : verdict === "valid" ? Check : verdict === "issue" ? X : Minus;
  return (
    <div className="flex items-center gap-[11px] border-b border-outline-variant py-[9px]">
      <span
        className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[6px]"
        style={{ background: bg, color: fg }}
      >
        <Glyph size={13} strokeWidth={2.4} />
      </span>
      <div className="flex-1 text-[13px] font-semibold text-on-surface">{doc.label}</div>
      <button type="button" title={`Download ${doc.label}`} onClick={onDownload} className="flex cursor-pointer p-0.5 text-secondary">
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
      ) : requested ? (
        <Chip tone="warm" dot={false}>Awaiting</Chip>
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
          {!allReviewed ? "Review all documents first" : "Flagged documents need reprovision"}
        </div>
      )}
    </div>
  );
}

export function ObDetailPanel({
  o, draftVerdicts, onClose, onApprove, onSubmitIssues, onRequireDocs, onVerdict, onDownload,
}: {
  o: AdminOnboardingRow;
  /** Verdicts as toggled in this session, keyed by doc_type. Held by the page (not
   *  here) so they survive closing and reopening a row — see page.tsx. */
  draftVerdicts: Record<string, DocVerdict>;
  onClose: () => void;
  onApprove: (id: string) => void;
  onSubmitIssues: (id: string, note: string) => void;
  onRequireDocs: (id: string) => void;
  onVerdict: (docType: string, v: "valid" | "issue") => void;
  onDownload: (docType: string) => void;
}) {
  const pending = o.status === "pending";
  const awaiting = o.status === "awaiting_docs";
  // Reads the session draft rather than the server's document status: toggles no
  // longer POST, so the server can't be the source of truth mid-review.
  const verdicts = o.documents.map((d) => draftVerdicts[d.doc_type] ?? null);
  // A document Compliance asked for again is exactly one left on DocStatus
  // "pending" while the cycle sits in pending_review.
  const requested = o.documents.map((d) => awaiting && d.status === "pending");
  const reviewed = verdicts.filter((v) => v !== null).length;
  const issues = verdicts.filter((v) => v === "issue").length;
  const reqCount = requested.filter(Boolean).length;
  const allReviewed = reviewed === verdicts.length;
  const hasIssue = issues > 0;
  const canApprove = pending && allReviewed && !hasIssue;
  const canEdit = useCanEdit("compliance.review");
  // Note-composing sub-state of the pending panel. Panel-local now that deleting
  // RejectModal removed the only thing that used to unmount this mid-review.
  const [issuing, setIssuing] = useState(false);
  const [issueNote, setIssueNote] = useState("");
  const issuingNow = issuing && hasIssue;
  return (
    <DetailShell
      eyebrow="Onboarding review"
      title={o.client}
      meta={`${o.rm} · ${o.submitted} · ${o.type}`}
      statusSlot={<ObStatusChip status={o.status} />}
      onClose={onClose}
    >
      <div className="grid grid-cols-2 gap-[11px]">
        <Fact k="Email" v={o.email} vSize={13} />
        <Fact k="Phone" v={o.phone} vSize={13} />
        <Fact k="IBHK Account" v={o.ibhk} vSize={14} />
        <Fact k="Silverwate Account" v={o.silverwate} vSize={14} />
      </div>
      <div className="mt-5">
        <SectionLabel>
          {awaiting
            ? `Required documents (${reqCount} awaiting reprovision)`
            : `Required documents (${reviewed}/${verdicts.length} reviewed)`}
        </SectionLabel>
        {pending && !allReviewed && !hasIssue && (
          <div className="mb-3">
            <Notice tone="info" icon={FileSearch}>
              Review each document and mark it <b>Valid</b> or <b>Issue</b>. Flagged documents can be sent back for reprovision.
            </Notice>
          </div>
        )}
        {pending && hasIssue && (
          <div className="mb-3">
            <Notice tone="warn" icon={TriangleAlert}>
              <b>{issues} document{issues > 1 ? "s" : ""} flagged</b> — request reprovision to have {o.rm} supply corrected copies.
            </Notice>
          </div>
        )}
        <div className="border-t border-outline-variant">
          {o.documents.map((d, i) => (
            <DocRow
              key={d.doc_type}
              doc={d}
              verdict={verdicts[i]}
              requested={requested[i]}
              /* View/Edit Gate Function */
              /* Gates the TOGGLE, not the row: a VIEW grant must still see the
                 package. DocRow renders read-only when onToggle is undefined
                 (Valid/Issue/Awaiting chips, or "Not reviewed"), which is the
                 same path a decided cycle already takes. onDownload stays
                 ungated on purpose — reading a document IS view access, and the
                 backend gates the download route on Action.ONBOARDING_REVIEW
                 independently of this page grant. */
              onToggle={pending && canEdit ? (v) => onVerdict(d.doc_type, v) : undefined}
              onDownload={() => onDownload(d.doc_type)}
            />
          ))}
        </div>
        {issuingNow && (
          <div className="mt-3.5">
            <SectionLabel>Note to {o.rm} (optional)</SectionLabel>
            <textarea
              autoFocus
              value={issueNote}
              onChange={(e) => setIssueNote(e.target.value)}
              rows={3}
              placeholder="e.g. Signature page missing on IPS; derivatives form references wrong client name…"
              className="box-border w-full resize-y rounded-[9px] border border-outline-variant px-3 py-2.5 text-[14px] text-on-surface outline-none"
            />
          </div>
        )}
        {!issuingNow && awaiting && o.complNote && (
          <div
            style={{
              marginTop: 14, background: "var(--surface-low)",
              border: "1px solid var(--outline-variant)", borderRadius: 10, padding: "11px 13px",
            }}
          >
            <SectionLabel style={{ marginBottom: 6 }}>
              Note sent to {o.rm}{decidedLabel(o.decidedAt) ? ` · ${decidedLabel(o.decidedAt)}` : ""}
            </SectionLabel>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--on-surface)" }}>{o.complNote}</div>
          </div>
        )}
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        {pending ? (
          issuingNow ? (
            <>
              <Button variant="secondary" onClick={() => { setIssuing(false); setIssueNote(""); }}>Cancel</Button>
              {/* View/Edit Gate Function */}
              {canEdit && (
                <Button icon={TriangleAlert} onClick={() => onSubmitIssues(o.id, issueNote)}>Submit Issues</Button>
              )}
            </>
          ) : (
            <>
              {/* View/Edit Gate Function */}
              {/* DELIBERATE DEVIATION from the design, which shows Raise Issue whenever
                  hasIssue: request_resubmit 409s if any document is still `in_review`,
                  so the looser gate would surface a backend 409 as an alert(). Approve
                  and Raise Issue therefore share one precondition. */}
              {canEdit && allReviewed && hasIssue && (
                <Button variant="secondary" icon={TriangleAlert} onClick={() => setIssuing(true)}>Raise Issue</Button>
              )}
              {/* View/Edit Gate Function */}
              {canEdit && <ApproveButton canApprove={canApprove} allReviewed={allReviewed} onApprove={() => onApprove(o.id)} />}
            </>
          )
        ) : awaiting ? (
          // ponytail: visible placeholder — no reminder endpoint exists yet. Wire it
          // when the backend grows one; disabled beats inventing a route.
          <Button variant="secondary" icon={Mail} disabled>Send reminder</Button>
        ) : (
          <>
            {/* View/Edit Gate Function */}
            {/* Only an ACTIVE cycle can be reopened — the backend 409s otherwise, and
                ObStatus "approved" maps 1:1 to backend `active` (see OB_STATUS_MAP). */}
            {canEdit && (
              <Button variant="secondary" icon={RefreshCw} onClick={() => onRequireDocs(o.id)}>
                Request reprovision
              </Button>
            )}
          </>
        )}
      </div>
    </DetailShell>
  );
}
