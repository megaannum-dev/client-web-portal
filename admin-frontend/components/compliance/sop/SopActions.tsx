"use client";

import { useState, type MouseEvent } from "react";
import { Download, FileUp, History, Loader2, Trash2 } from "@/lib/icons";
import { useCanEdit } from "@/hooks/usePageAccess";

/** 34px icon button; `danger` turns it error-coloured on hover. Shared with the versions timeline.
 *  If `onClick` returns a promise (downloads), the icon spins until it settles. */
export function SopIconBtn({
  icon: Icon, title, onClick, danger,
}: {
  icon: typeof Download;
  title: string;
  onClick: () => void | Promise<unknown>;
  danger?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const stop = (e: MouseEvent) => {
    e.stopPropagation();
    const r = onClick();
    if (r instanceof Promise) {
      setBusy(true);
      void r.finally(() => setBusy(false));
    }
  };
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-busy={busy}
      disabled={busy}
      onClick={stop}
      className={`inline-flex h-[34px] w-[34px] flex-none items-center justify-center rounded border border-outline-variant bg-surface-lowest text-secondary transition-all duration-150 hover:bg-surface-container ${busy ? "cursor-progress" : "cursor-pointer"} ${danger ? "hover:border-error hover:text-error" : "hover:text-on-surface"}`}
    >
      {busy ? <Loader2 size={16} strokeWidth={2} className="animate-spin" /> : <Icon size={16} strokeWidth={2} />}
    </button>
  );
}

/** History / download are for everyone; upload-version + delete only with the EDIT grant. */
export function SopActions({
  versionCount, onHistory, onUpload, onDownload, onDelete,
}: {
  versionCount: number;
  onHistory: () => void;
  onUpload: () => void;
  onDownload: () => Promise<unknown>;
  onDelete: () => void;
}) {
  const canWrite = useCanEdit("compliance.sop");
  return (
    <div className="inline-flex gap-2">
      <SopIconBtn icon={History} title={`Version history (${versionCount})`} onClick={onHistory} />
      {canWrite && <SopIconBtn icon={FileUp} title="Upload new version" onClick={onUpload} />}
      <SopIconBtn icon={Download} title="Download latest" onClick={onDownload} />
      {canWrite && <SopIconBtn icon={Trash2} title="Delete SOP" danger onClick={onDelete} />}
    </div>
  );
}
