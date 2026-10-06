import { FormatBadgeBig } from "./FormatBadge";
import { ClassTag, VerTag } from "./Tags";
import { SopActions } from "./SopActions";
import { Who } from "./Who";
import { fmtDate, fmtSize } from "@/components/compliance/ic-notes/format";
import type { SopDocumentDTO } from "@/lib/sop/types";

export interface SopRowHandlers {
  onOpen: (id: string, tab: "overview" | "versions") => void;
  onUpload: (sop: SopDocumentDTO) => void;
  onDownload: (sop: SopDocumentDTO) => Promise<unknown>;
  onDelete: (sop: SopDocumentDTO) => void;
  openId?: string | null;
}

export function sopActionsFor(sop: SopDocumentDTO, h: SopRowHandlers) {
  return (
    <SopActions
      versionCount={sop.version_count}
      onHistory={() => h.onOpen(sop.id, "versions")}
      onUpload={() => h.onUpload(sop)}
      onDownload={() => h.onDownload(sop)}
      onDelete={() => h.onDelete(sop)}
    />
  );
}

export function SopCard({ sop, ...h }: { sop: SopDocumentDTO } & SopRowHandlers) {
  const l = sop.latest;
  return (
    <article
      onClick={() => h.onOpen(sop.id, "overview")}
      className={`flex cursor-pointer flex-col gap-4 rounded-lg border bg-surface-lowest p-5 shadow-card transition-[box-shadow,border-color] duration-150 hover:shadow-overlay ${h.openId === sop.id ? "border-primary" : "border-outline-variant"}`}
    >
      <div className="flex items-start gap-3.5">
        <FormatBadgeBig filename={l.filename} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5"><ClassTag category={sop.category} /><VerTag version={l.version_no} /></div>
          <h3 className="text-[16px] font-semibold leading-[22px] text-on-surface">{sop.title}</h3>
          <div className="text-[13px] text-secondary">Updated {fmtDate(l.uploaded_at)} · {fmtSize(l.size_bytes)}</div>
        </div>
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 border-t border-outline-variant pt-3.5">
        <Who v={l} />
        {sopActionsFor(sop, h)}
      </div>
    </article>
  );
}
