"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Shield, X, Bell, Check, Upload, Clock, TriangleAlert, AlertCircle, Download } from "@/lib/icons";
import type { LucideIcon } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { KNOWN_CLIENT_IDS } from "@/lib/mock/rm-data";
import type { UseOnboardingBoardResult } from "@/hooks/api/useOnboardingBoard";
import type { ChipTone } from "@/components/ui/Chip";
import type { DocStatus, KycBoardClient } from "@/lib/onboarding/types";

const DOC_ICON: Record<string, LucideIcon> = {
  active: Check, pending: Clock, review: Clock, failed: X, overdue: TriangleAlert, neutral: Clock,
};
const DOC_TINT: Record<string, [string, string]> = {
  active:  ["#e3f1e7", "#2f7a47"],
  pending: ["#f8ecd6", "#b9741f"],
  review:  ["#eef2f7", "#585f6c"],
  failed:  ["#f6dfd9", "#b1402f"],
  overdue: ["#ffebee", "#b71c1c"],
  neutral: ["#f3f4f5", "#5f5e5e"],
};

// DocStatus -> chip tone / display label — the KYC panel's own styling
// lookup (mirrors the deleted mock's tone-per-doc-status shape 1:1).
const DOC_STATUS_TONE: Record<DocStatus, ChipTone> = {
  not_started: "neutral", uploaded: "pending", in_review: "review",
  verified: "active", rejected: "failed", expired: "overdue",
};
const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  not_started: "Not started", uploaded: "Uploaded", in_review: "In review",
  verified: "Verified", rejected: "Rejected", expired: "Expired",
};

/** Pure function of the two counts, per §6 FE-3's invariant — not a preset key. */
function chipToneForCounts(verified: number, required: number): ChipTone {
  if (verified === 0) return "neutral";
  return verified === required ? "active" : "warm";
}

function KanbanCard({ item, selected, onClick }: { item: KycBoardClient; selected: boolean; onClick: () => void }) {
  const tone = chipToneForCounts(item.verifiedCount, item.requiredCount);
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full flex-col gap-2.5 rounded-md border-[1.5px] p-4 text-left transition-all duration-150",
        selected ? "border-primary" : "border-outline-variant bg-white hover:border-outline hover:bg-surface-low",
      )}
      style={selected ? { background: "rgba(242,116,5,.07)" } : undefined}
    >
      <div className="flex items-start justify-between gap-2.5">
        <span className="text-[14px] font-semibold leading-tight text-on-surface">{item.name}</span>
        {item.status === "initial"
          ? <Chip tone="neutral" dot={false}>Not started</Chip>
          : <Chip tone={tone} dot={false}>{item.verifiedCount}/{item.requiredCount} verified</Chip>}
      </div>
      <div className="flex items-center gap-1.5 text-[12px] text-secondary">
        <Shield size={13} strokeWidth={1.75} />
        <span>KYC &amp; docs · {item.owner}</span>
      </div>
    </button>
  );
}

// Doc statuses that count as "provided" — mirrors the deleted mock's
// BLOCKING_STATUSES rule, now sourced from DocStatus instead of a string set.
const NON_BLOCKING_DOC_STATUSES = new Set<DocStatus>(["uploaded", "verified", "in_review"]);

type DownloadResult = { success: boolean; error?: string; filename?: string; contentType?: string; base64?: string };

// Rehydrate a base64 download payload into a Blob and trigger a save dialog
// (mirrors app/(roles)/compliance/review/page.tsx's saveBase64File — cookie
// token can't ride a plain <a href>, so every download in this codebase is a
// base64 proxy decoded client-side instead).
function saveBase64File(filename: string, contentType: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function KycPanel({
  item, onClose, onOpenProfile, onUploadDoc, onSubmitAll, onDownload, onDownloadAll,
}: {
  item: KycBoardClient;
  onClose: () => void;
  onOpenProfile: (id: string) => void;
  onUploadDoc: (onboardingId: string, docType: string, file: File) => Promise<{ success: boolean; error?: string }>;
  onSubmitAll: (onboardingId: string) => Promise<{ success: boolean; error?: string }>;
  onDownload?: (onboardingId: string, docType: string) => Promise<DownloadResult>;
  onDownloadAll?: (onboardingId: string) => Promise<DownloadResult>;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const docs = item.documents;
  const locked = item.status === "reviewing" || item.status === "active";

  const outstanding = docs.filter((d) => !NON_BLOCKING_DOC_STATUSES.has(d.status)).length;
  const canSubmit = outstanding === 0;

  const handleUpload = (docType: string) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    void onUploadDoc(item.id, docType, file).then((r) => {
      if (!r.success) alert(`Upload failed: ${r.error}`);
    });
  };

  const handleSubmitAll = () => {
    void onSubmitAll(item.id).then((r) => {
      if (!r.success) alert(`Could not submit: ${r.error}`);
    });
  };

  const handleDownload = (docType: string) => {
    void onDownload?.(item.id, docType)?.then((r) => {
      if (r.success) saveBase64File(r.filename!, r.contentType!, r.base64!);
      else alert(`Download failed: ${r.error}`);
    });
  };

  const handleDownloadAll = () => {
    void onDownloadAll?.(item.id)?.then((r) => {
      if (r.success) saveBase64File(r.filename!, r.contentType!, r.base64!);
      else alert(`Download failed: ${r.error}`);
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-outline-variant px-5 pb-3.5 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[16px] font-bold leading-tight text-on-surface">{item.name}</div>
            <div className="mt-1 text-[12px] text-secondary">KYC Review · {item.owner}</div>
          </div>
          <button type="button" onClick={onClose} className="flex shrink-0 rounded p-1 text-secondary hover:bg-surface-container">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="mt-3.5 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">KYC &amp; Compliance Docs</span>
          <Chip tone={chipToneForCounts(item.verifiedCount, item.requiredCount)} dot={false}>{item.verifiedCount}/{item.requiredCount} verified</Chip>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-1">
        {docs.map((d, i) => {
          const tone = DOC_STATUS_TONE[d.status];
          const [bg, fg] = DOC_TINT[tone] ?? DOC_TINT.neutral;
          const Glyph = DOC_ICON[tone] ?? Clock;
          const hov = hovered === i;
          return (
            <div
              key={d.doc_type}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              className={clsx("flex items-center gap-3 py-[13px]", i < docs.length - 1 && "border-b border-outline-variant")}
            >
              <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md" style={{ background: bg, color: fg }}>
                <Glyph size={14} strokeWidth={2} />
              </span>
              <span className="flex-1 text-[14px] font-semibold text-on-surface">{d.label}</span>
              {hov && d.can_reupload ? (
                <label
                  className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-[5px] text-[12px] font-semibold text-primary"
                  style={{ background: "rgba(242,116,5,.12)" }}
                >
                  <Upload size={13} strokeWidth={2} />Upload
                  <input type="file" className="hidden" onChange={handleUpload(d.doc_type)} />
                </label>
              ) : !d.can_reupload && d.filename ? (
                <button
                  type="button"
                  onClick={() => handleDownload(d.doc_type)}
                  className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap border-none bg-transparent p-0 text-[12px] font-semibold text-primary"
                >
                  <Download size={13} strokeWidth={2} /> {DOC_STATUS_LABEL[d.status]}
                </button>
              ) : (
                <Chip tone={tone} dot={false}>{DOC_STATUS_LABEL[d.status]}</Chip>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex shrink-0 flex-col gap-2.5 border-t border-outline-variant px-5 py-3.5">
        {!canSubmit && (
          <div className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "#b9741f" }}>
            <AlertCircle size={14} strokeWidth={2} className="shrink-0" />
            <span>{outstanding} document{outstanding === 1 ? "" : "s"} still required before you can submit.</span>
          </div>
        )}
        <div className="flex gap-2.5">
          {!locked && <Button variant="secondary" icon={Bell} full>Request docs</Button>}
          {locked ? (
            <Button icon={Download} full onClick={handleDownloadAll}>Download All</Button>
          ) : (
            <Button icon={Check} full disabled={!canSubmit} onClick={handleSubmitAll}>Submit All</Button>
          )}
        </div>
        <button
          type="button"
          onClick={() => onOpenProfile(item.id)}
          className="py-0.5 text-left text-[13px] font-semibold text-primary"
        >
          Open client profile →
        </button>
      </div>
    </div>
  );
}

export function OnboardingBoard(props: UseOnboardingBoardResult) {
  const router = useRouter();
  const { data: columns, loading, error, uploadDocument, submitAll, fetchOnboarding, downloadDocument, downloadAllDocuments } = props;
  // Track by id, not by a snapshot object — a refetch after upload/submit
  // must be reflected in the open panel, not the stale item captured at
  // selection time.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const panelOpen = !!selectedId;
  const selectedItem = (selectedId && columns?.flatMap((c) => c.clients).find((c) => c.id === selectedId)) || null;

  // Board rows never carry documents (perf) -- fetch the real doc rows for
  // whichever onboarding is open, and refresh it after any upload/submit.
  const [detail, setDetail] = useState<KycBoardClient | null>(null);
  const loadDetail = useCallback((id: string) => {
    fetchOnboarding(id).then((r) => { if (r.success && r.data) setDetail(r.data); });
  }, [fetchOnboarding]);
  useEffect(() => {
    if (selectedId) loadDetail(selectedId); else setDetail(null);
  }, [selectedId, loadDetail]);

  // Remember the last opened item so the floating panel can fade/slide out
  // gracefully instead of unmounting its content mid-transition.
  const lastItemRef = useRef<KycBoardClient | null>(null);
  if (selectedItem) lastItemRef.current = selectedItem;
  const panelItem = selectedItem ?? lastItemRef.current;
  const panelItemWithDocs = panelItem && detail?.id === panelItem.id
    ? { ...panelItem, documents: detail.documents, verifiedCount: detail.verifiedCount, requiredCount: detail.requiredCount }
    : panelItem;

  const uploadAndRefreshDetail = useCallback(
    async (onboardingId: string, docType: string, file: File) => {
      const r = await uploadDocument(onboardingId, docType, file);
      if (r.success) loadDetail(onboardingId);
      return r;
    },
    [uploadDocument, loadDetail],
  );
  const submitAndRefreshDetail = useCallback(
    async (onboardingId: string) => {
      const r = await submitAll(onboardingId);
      if (r.success) loadDetail(onboardingId);
      return r;
    },
    [submitAll, loadDetail],
  );

  const openProfile = (id: string) => {
    if (KNOWN_CLIENT_IDS.has(id)) {
      setSelectedId(null);
      router.push(`/rm/client-detail/${id}`);
    }
  };

  if (!columns) {
    return <div className="text-[13px] text-secondary">{error ? `Failed to load onboarding board: ${error}` : loading ? "Loading…" : "No data."}</div>;
  }

  const totalClients = columns.reduce((n, col) => n + col.clients.length, 0);

  return (
    <>
      <div className="mb-[18px] flex items-center justify-between">
        <span className="text-[13px] text-secondary">{totalClients} clients across {columns.length} queues</span>
        {panelOpen && <span className="text-[12px] text-secondary">Click × to close panel</span>}
      </div>

      {/* Board squeezes left to make room for the floating panel */}
      <div
        className="transition-[padding-right] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ paddingRight: panelOpen ? 396 : 0 }}
      >
        <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
          {columns.map((col) => (
            <div key={col.label} className="flex flex-col gap-2.5 rounded-[14px] bg-surface-low p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold uppercase tracking-[0.05em] text-secondary">{col.label}</span>
                <span className="text-[12px] font-bold text-secondary">{col.clients.length}</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {col.clients.map((item) => (
                  <KanbanCard
                    key={item.id}
                    item={item}
                    selected={selectedId === item.id}
                    onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating KYC panel — overlays the top-right, covering the Start
          Onboarding action, same rounded/shadow-overlay treatment as the
          client-details flow detail panel. */}
      <div
        className="fixed z-40 w-96 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          top: 80,
          right: 24,
          bottom: 24,
          opacity: panelOpen ? 1 : 0,
          transform: panelOpen ? "translateX(0)" : "translateX(28px)",
          pointerEvents: panelOpen ? "auto" : "none",
        }}
      >
        <div className="flex h-full flex-col overflow-hidden rounded-[20px] border border-outline-variant bg-white shadow-overlay">
          {panelItemWithDocs && (
            <KycPanel
              item={panelItemWithDocs}
              onClose={() => setSelectedId(null)}
              onOpenProfile={openProfile}
              onUploadDoc={uploadAndRefreshDetail}
              onSubmitAll={submitAndRefreshDetail}
              onDownload={downloadDocument}
              onDownloadAll={downloadAllDocuments}
            />
          )}
        </div>
      </div>
    </>
  );
}
