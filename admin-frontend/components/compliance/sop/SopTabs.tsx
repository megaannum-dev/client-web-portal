import { LayoutGrid, List } from "@/lib/icons";
import { SOP_CATEGORIES, type SopCategory } from "@/lib/sop/types";

export type SopTabValue = "all" | SopCategory;
export type SopView = "cards" | "rows";

export function SopTabs({ value, onChange }: { value: SopTabValue; onChange: (v: SopTabValue) => void }) {
  const items: { key: SopTabValue; label: string }[] = [{ key: "all", label: "All Types" }, ...SOP_CATEGORIES];
  return (
    <div role="tablist" className="flex flex-wrap gap-2.5">
      {items.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={`h-10 cursor-pointer rounded-full px-[22px] text-[14px] font-semibold transition-all duration-150 ${value === t.key ? "bg-primary text-white" : "bg-surface-container text-on-surface"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function SopViewToggle({ value, onChange }: { value: SopView; onChange: (v: SopView) => void }) {
  const opt = (v: SopView, label: string, Icon: typeof List) => (
    <button
      type="button"
      title={label}
      aria-pressed={value === v}
      onClick={() => onChange(v)}
      className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[6px] px-3 text-[13px] font-semibold transition-all duration-150 ${value === v ? "bg-surface-lowest text-on-surface shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-secondary"}`}
    >
      <Icon size={15} strokeWidth={2} />{label}
    </button>
  );
  return (
    <div className="inline-flex gap-0.5 rounded bg-surface-container p-[3px]">
      {opt("cards", "Cards", LayoutGrid)}
      {opt("rows", "Rows", List)}
    </div>
  );
}
