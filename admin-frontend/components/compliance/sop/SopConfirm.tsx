"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/pc/Shared";
import { TriangleAlert, Trash2 } from "@/lib/icons";
import { fmtDate } from "@/components/compliance/ic-notes/format";
import { sopFormat } from "./FormatBadge";
import type { SopDocumentDTO, SopVersionDTO } from "@/lib/sop/types";

/** Whole-SOP delete when `version` is undefined, else a single-version delete.
 *  `versions` supplies the version's format/date and the next-current lookup. */
export function SopConfirm({
  sop, version, versions, busy, onCancel, onConfirm,
}: {
  sop: SopDocumentDTO;
  version?: number;
  versions?: SopVersionDTO[] | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const list = versions ?? [sop.latest];
  const only = version !== undefined && (sop.version_count <= 1 || list.length <= 1);
  const ver = version === undefined ? undefined : list.find((v) => v.version_no === version) ?? sop.latest;

  let body: string;
  if (version === undefined) {
    const n = sop.version_count;
    body = `All ${n} version${n > 1 ? "s" : ""} of this SOP will be permanently removed for every role. This cannot be undone.`;
  } else if (only) {
    body = "This is the only version. Deleting it removes the entire SOP. This cannot be undone.";
  } else {
    body = `Version ${version} (${sopFormat(ver!.filename).label}, ${fmtDate(ver!.uploaded_at)}) will be permanently removed from the history.`;
    if (version === sop.latest.version_no) {
      const next = Math.max(0, ...list.filter((v) => v.version_no !== version).map((v) => v.version_no));
      if (next) body += ` Version ${next} will become current.`;
    }
    body += " This cannot be undone.";
  }

  return (
    <Modal
      title={version === undefined || only ? "Delete SOP?" : `Delete version ${version}?`}
      subtitle={sop.title}
      onClose={onCancel}
      width={460}
      centered
      footer={
        <div className="flex w-full justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button icon={Trash2} onClick={onConfirm} disabled={busy} className="!border-transparent !bg-error !text-white">
            {version !== undefined && !only ? `Delete v${version}` : "Delete SOP"}
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-3 rounded-md border border-[rgba(186,26,26,0.2)] bg-[rgba(186,26,26,0.06)] p-3.5">
        <TriangleAlert size={18} strokeWidth={2} className="mt-px flex-none text-error" />
        <div className="text-[14px] leading-[1.55] text-on-surface">{body}</div>
      </div>
    </Modal>
  );
}
