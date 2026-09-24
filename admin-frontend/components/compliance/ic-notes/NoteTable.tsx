import { Download } from "@/lib/icons";
import { FormatBadge } from "./FormatBadge";
import { Uploader } from "./Uploader";
import { fmtDate, fmtTime, fmtSize } from "./format";
import type { IcNoteDTO } from "@/lib/ic-notes/types";

export function NoteTable({ notes, onDownload }: { notes: IcNoteDTO[]; onDownload: (id: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-lowest">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <thead>
          <tr className="border-b border-outline-variant bg-surface-low">
            {["Title", "Date", "Time", "Uploaded by", ""].map((h) => (
              <th key={h} className="px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-secondary">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {notes.map((note) => (
            <tr key={note.id} className="border-b border-outline-variant last:border-0">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <FormatBadge filename={note.filename} />
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-bold text-on-surface">{note.title}</div>
                    <div className="text-[12px] text-secondary">{fmtSize(note.size_bytes)}</div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-[13px] text-on-surface">{fmtDate(note.meeting_at)}</td>
              <td className="px-4 py-3 text-[13px] text-on-surface">{fmtTime(note.meeting_at)}</td>
              <td className="px-4 py-3">
                <Uploader name={note.uploaded_by_name} role={note.uploaded_by_role} email={note.uploaded_by_email} />
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  aria-label="Download"
                  onClick={() => onDownload(note.id)}
                  className="inline-flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded border border-outline-variant text-secondary hover:bg-surface-container"
                >
                  <Download size={16} strokeWidth={2} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
