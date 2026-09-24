import { FileText } from "@/lib/icons";
import { extOf, type IcNoteFormat } from "@/lib/ic-notes/types";

const TONE: Record<IcNoteFormat, { bg: string; fg: string }> = {
  pdf: { bg: "#fdecea", fg: "#b3261e" },
  docx: { bg: "#e8f0fe", fg: "#1a56b8" },
  md: { bg: "var(--surface-container)", fg: "var(--on-surface)" },
};

function toneFor(filename: string) {
  const ext = extOf(filename) as IcNoteFormat;
  return TONE[ext] ?? TONE.md;
}

/** Small 40x22 label badge (table rows / card size chip). */
export function FormatBadge({ filename }: { filename: string }) {
  const t = toneFor(filename);
  return (
    <span
      className="inline-flex h-[22px] w-10 items-center justify-center rounded-[6px] text-[11px] font-bold tracking-[0.05em]"
      style={{ background: t.bg, color: t.fg }}
    >
      {extOf(filename).toUpperCase()}
    </span>
  );
}

/** Big 48x48 icon tile (card header / dialog chosen-file preview). */
export function FormatBadgeBig({ filename }: { filename: string }) {
  const t = toneFor(filename);
  return (
    <span
      className="flex h-12 w-12 flex-none items-center justify-center rounded-[10px]"
      style={{ background: t.bg, color: t.fg }}
    >
      <FileText size={20} strokeWidth={2} />
    </span>
  );
}
