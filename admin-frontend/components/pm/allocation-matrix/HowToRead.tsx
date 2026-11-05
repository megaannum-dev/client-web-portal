import { Rows3, Columns3, Grid3x3 } from "@/lib/icons";

type Toggle = "units" | "pct";

/* shared uppercase label (amLabel) — matches Eyebrow but inline */
export const LABEL = "text-[11px] font-bold uppercase tracking-[0.05em] text-secondary";

/* ============================================================
   "HOW TO READ THIS" — ambient footnote below the matrix, not a
   boxed section. Low visual weight on purpose: it's a reminder for
   returning users, not a first-read explainer.
   ============================================================ */
export function HowToRead({ view }: { view: Toggle }) {
  const rows: [typeof Rows3, string, string][] = [
    [Rows3, "Each row", "one client — name"],
    [Columns3, "Each column", "one live model — name, master IB account & size per unit"],
    [Grid3x3, "Each cell", (view === "pct" ? "the client’s share of that model" : "units the client holds of that model") + ", plus that client’s dedicated IB account for this model"],
  ];
  return (
    <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-1.5 px-1 text-[12px] text-outline">
      {rows.map(([Icon, label, text]) => (
        <span key={label} className="inline-flex items-center gap-1">
          <Icon size={13} strokeWidth={2} className="text-primary" />
          <b className="font-semibold text-secondary">{label}:</b> {text}
        </span>
      ))}
    </div>
  );
}
