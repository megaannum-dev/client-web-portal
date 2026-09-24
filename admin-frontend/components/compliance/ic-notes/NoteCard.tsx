import { Download } from "@/lib/icons";
import { FormatBadgeBig } from "./FormatBadge";
import { Uploader } from "./Uploader";
import { fmtDate, fmtTime, fmtSize } from "./format";
import type { IcNoteDTO } from "@/lib/ic-notes/types";

export function NoteCard({ note, onDownload }: { note: IcNoteDTO; onDownload: (id: string) => void }) {
  return (
    <article className="flex flex-col gap-4 rounded-lg border border-outline-variant bg-surface-lowest p-5 shadow-card transition-shadow hover:shadow-overlay">
      <div className="flex items-start gap-3">
        <FormatBadgeBig filename={note.filename} />
        <div className="min-w-0">
          <div className="truncate text-[16px] font-semibold text-on-surface">{note.title}</div>
          <div className="mt-0.5 text-[13px] text-secondary">
            {fmtDate(note.meeting_at)} · {fmtTime(note.meeting_at)} · {fmtSize(note.size_bytes)}
          </div>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-outline-variant pt-4">
        <Uploader name={note.uploaded_by_name} role={note.uploaded_by_role} email={note.uploaded_by_email} />
        <button
          type="button"
          aria-label="Download"
          onClick={() => onDownload(note.id)}
          className="flex h-[34px] w-[34px] flex-none cursor-pointer items-center justify-center rounded border border-outline-variant text-secondary hover:bg-surface-container"
        >
          <Download size={16} strokeWidth={2} />
        </button>
      </div>
    </article>
  );
}
