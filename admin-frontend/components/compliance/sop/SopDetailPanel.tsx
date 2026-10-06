"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Download, FileUp, Trash2 } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { DetailShell, coLabelCls } from "@/components/compliance/Shared";
import { FormatBadge, FormatBadgeBig, sopFormat } from "./FormatBadge";
import { SopIconBtn } from "./SopActions";
import { ClassTag, VerTag } from "./Tags";
import { Who } from "./Who";
import { fmtDate, fmtSize } from "@/components/compliance/ic-notes/format";
import { useCanEdit } from "@/hooks/usePageAccess";
import { downloadSopVersionAction, listSopVersionsAction } from "@/app/(roles)/compliance/sop/actions";
import { SOP_CATEGORIES, type SopDocumentDTO, type SopVersionDTO } from "@/lib/sop/types";

export type SopPanelTab = "overview" | "versions";

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className={coLabelCls}>{k}</span>
      <div className="text-[14px] text-on-surface">{children}</div>
    </div>
  );
}

export function SopDetailPanel({
  sop, tab, onTab, onClose, onDownload, onUpload, onDeleteSop, onDeleteVersion, confirmOpen,
}: {
  sop: SopDocumentDTO;
  tab: SopPanelTab;
  onTab: (t: SopPanelTab) => void;
  onClose: () => void;
  onDownload: (v: SopVersionDTO) => void;
  onUpload: () => void;
  onDeleteSop: () => void;
  onDeleteVersion: (v: SopVersionDTO, versions: SopVersionDTO[]) => void;
  /** Escape belongs to the confirm dialog while it is open. */
  confirmOpen?: boolean;
}) {
  const canWrite = useCanEdit("compliance.sop");
  const latest = sop.latest;
  const fmt = sopFormat(latest.filename);
  const category = SOP_CATEGORIES.find((c) => c.key === sop.category)?.label ?? sop.category;

  useEffect(() => {
    if (confirmOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [confirmOpen, onClose]);

  // Image preview: fetch the latest version's bytes.
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    setPreview(null);
    if (!fmt.image) return;
    let live = true;
    void downloadSopVersionAction(sop.id, latest.version_no).then((r) => {
      if (live && r.success) setPreview(`data:${r.data.contentType};base64,${r.data.base64}`);
    });
    return () => { live = false; };
  }, [sop.id, latest.version_no, fmt.image]);

  // Versions: lazy, refetched when the count changes.
  const [versions, setVersions] = useState<SopVersionDTO[] | null>(null);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  useEffect(() => {
    if (tab !== "versions") return;
    let live = true;
    setVersionsError(null);
    void listSopVersionsAction(sop.id).then((r) => {
      if (!live) return;
      if (r.success) setVersions([...r.data].sort((a, b) => b.version_no - a.version_no));
      else setVersionsError(r.error);
    });
    return () => { live = false; };
  }, [tab, sop.id, sop.version_count]);

  const tabBtn = (key: SopPanelTab, label: string) => (
    <button
      key={key}
      type="button"
      role="tab"
      aria-selected={tab === key}
      onClick={() => onTab(key)}
      className={`relative cursor-pointer whitespace-nowrap px-3 pb-3.5 pt-3 text-[13.5px] font-bold ${tab === key ? "text-on-surface" : "text-secondary"}`}
    >
      {label}
      {tab === key && <span className="absolute inset-x-[9px] -bottom-px h-[3px] rounded-[2px] bg-primary" />}
    </button>
  );

  return (
    <DetailShell
      title={sop.title}
      meta={<span className="mt-2 flex gap-1.5"><ClassTag category={sop.category} /><VerTag version={latest.version_no} /></span>}
      onClose={onClose}
      tabs={
        <div role="tablist" className="flex flex-none gap-1 border-b border-outline-variant px-4">
          {tabBtn("overview", "Overview")}
          {tabBtn("versions", `Versions (${sop.version_count})`)}
        </div>
      }
      footer={
        <div className="flex flex-none items-center justify-end gap-3 border-t border-outline-variant bg-surface-low px-[22px] py-[13px]">
          {canWrite && (
            <button
              type="button"
              onClick={onDeleteSop}
              className="mr-auto inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-error"
            >
              <Trash2 size={15} strokeWidth={2} />Delete SOP
            </button>
          )}
          {canWrite && <Button variant="secondary" icon={FileUp} onClick={onUpload}>New version</Button>}
          <Button icon={Download} onClick={() => onDownload(latest)}>Download</Button>
        </div>
      }
    >
      {tab === "overview" ? (
        <div className="flex flex-col gap-5 [overflow-wrap:anywhere]">
          {fmt.image && preview ? (
            <div className="overflow-hidden rounded-md border border-outline-variant bg-surface-low">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt={sop.title} className="block max-h-[260px] w-full object-contain" />
            </div>
          ) : (
            <div className="flex items-center gap-3.5 rounded-md border border-outline-variant bg-surface-low p-4">
              <FormatBadgeBig filename={latest.filename} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-on-surface">{latest.filename}</div>
                <div className="text-[13px] text-secondary">{fmt.image ? "Diagram" : "Document"} · {fmtSize(latest.size_bytes)}</div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Fact k="Class">{category}</Fact>
            <Fact k="Current version">v{latest.version_no}</Fact>
            <Fact k="Format">{fmt.label}</Fact>
            <Fact k="Size">{fmtSize(latest.size_bytes)}</Fact>
            <Fact k="Last updated">{fmtDate(latest.uploaded_at)}</Fact>
            <Fact k="First released">{fmtDate(sop.created_at)}</Fact>
          </div>
          <Fact k="Updated by"><Who v={latest} /></Fact>
          {latest.change_note && <Fact k="Change note">{latest.change_note}</Fact>}
        </div>
      ) : versionsError ? (
        <div className="text-[13.5px] text-error">{versionsError}</div>
      ) : !versions ? (
        <div className="text-[13.5px] text-secondary">Loading versions…</div>
      ) : (
        <div className="relative pl-[18px]">
          <span className="absolute bottom-2 left-1 top-1.5 w-[1.5px] bg-outline-variant" />
          {versions.map((v, i) => (
            <div key={v.id} className={`relative flex items-start gap-3 ${i < versions.length - 1 ? "pb-[18px]" : ""}`}>
              <span
                className={`absolute -left-[18px] top-[5px] h-[9px] w-[9px] rounded-full border-[1.5px] ${i === 0 ? "border-primary bg-primary" : "border-outline bg-surface-highest"}`}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-bold text-on-surface">Version {v.version_no}</span>
                  <FormatBadge filename={v.filename} />
                  {i === 0 && (
                    <span className="inline-flex h-5 items-center rounded-full bg-primary-fixed px-2 text-[11px] font-bold uppercase tracking-[0.05em] text-primary">Current</span>
                  )}
                </div>
                {v.change_note && <div className="text-[13.5px] text-on-surface">{v.change_note}</div>}
                <div className="text-[12.5px] text-secondary">{fmtDate(v.uploaded_at)} · {v.uploaded_by_name} · {fmtSize(v.size_bytes)}</div>
              </div>
              <div className="flex flex-none gap-2">
                <SopIconBtn icon={Download} title={`Download v${v.version_no}`} onClick={() => onDownload(v)} />
                {canWrite && <SopIconBtn icon={Trash2} title={`Delete v${v.version_no}`} danger onClick={() => onDeleteVersion(v, versions)} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </DetailShell>
  );
}
