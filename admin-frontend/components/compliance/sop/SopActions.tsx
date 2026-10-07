"use client";

import { Download, FileUp, History, Trash2 } from "@/lib/icons";
import { AsyncIconButton } from "@/components/ui/AsyncIconButton";
import { useCanEdit } from "@/hooks/usePageAccess";

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
      <AsyncIconButton icon={History} title={`Version history (${versionCount})`} onClick={onHistory} />
      {canWrite && <AsyncIconButton icon={FileUp} title="Upload new version" onClick={onUpload} />}
      <AsyncIconButton icon={Download} title="Download latest" onClick={onDownload} />
      {canWrite && <AsyncIconButton icon={Trash2} title="Delete SOP" danger onClick={onDelete} />}
    </div>
  );
}
