import { SOP_FORMATS, extOf } from "@/lib/sop/types";

/** Unknown extensions fall back to the TXT style (label is still the ext). */
export function sopFormat(filename: string) {
  const ext = extOf(filename);
  const f = SOP_FORMATS[ext] ?? SOP_FORMATS.txt;
  return { ext, ...f, label: SOP_FORMATS[ext]?.label ?? ext.toUpperCase() };
}

/** Small label badge (22px tall). */
export function FormatBadge({ filename }: { filename: string }) {
  const f = sopFormat(filename);
  return (
    <span
      className="inline-flex h-[22px] min-w-10 flex-none items-center justify-center rounded-[6px] text-[11px] font-bold tracking-[0.05em]"
      style={{ background: f.bg, color: f.fg }}
    >
      {f.label}
    </span>
  );
}

/** Big 48px label tile (cards, file preview, dropzone). */
export function FormatBadgeBig({ filename }: { filename: string }) {
  const f = sopFormat(filename);
  return (
    <span
      className="inline-flex h-12 min-w-12 flex-none items-center justify-center rounded-[10px] text-[12px] font-bold tracking-[0.05em]"
      style={{ background: f.bg, color: f.fg }}
    >
      {f.label}
    </span>
  );
}
