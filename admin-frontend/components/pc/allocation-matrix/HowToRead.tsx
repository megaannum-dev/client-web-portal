import { Info, Rows3, Columns3, Grid3x3 } from "@/lib/icons";

type Toggle = "units" | "pct";

/* shared uppercase label (amLabel) — matches Eyebrow but inline */
export const LABEL = "text-[11px] font-bold uppercase tracking-[0.05em] text-secondary";

/* ============================================================
   "HOW TO READ THIS" legend strip
   ============================================================ */
export function HowToRead({ view }: { view: Toggle }) {
  const rows: [typeof Rows3, string, string][] = [
    [Rows3, "Each row", "one client — name & IB Account ID"],
    [Columns3, "Each column", "one live model — name & model size per unit"],
    [Grid3x3, "Each cell", view === "pct" ? "the client’s share of that model" : "units the client holds of that model"],
  ];
  return (
    <div className="mb-3.5 flex flex-wrap gap-x-6 gap-y-2.5 rounded-md border border-outline-variant bg-surface-low px-4 py-3">
      <div className={`flex items-center gap-[7px] ${LABEL}`}>
        <Info size={14} strokeWidth={2} />How to read this
      </div>
      {rows.map(([Icon, label, text]) => (
        <div key={label} className="flex items-center gap-[7px] text-[12.5px] text-secondary">
          <Icon size={14} strokeWidth={2} className="text-primary" />
          <span><b className="text-on-surface">{label}:</b> {text}</span>
        </div>
      ))}
    </div>
  );
}
