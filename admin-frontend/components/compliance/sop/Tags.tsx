import { SOP_CATEGORIES, type SopCategory } from "@/lib/sop/types";

export function ClassTag({ category }: { category: SopCategory }) {
  const c = SOP_CATEGORIES.find((x) => x.key === category) ?? SOP_CATEGORIES[3];
  return (
    <span
      className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2.5 text-[11px] font-bold uppercase tracking-[0.05em]"
      style={{ background: c.bg, color: c.fg }}
    >
      {c.label}
    </span>
  );
}

export function VerTag({ version }: { version: number }) {
  return (
    <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-[6px] border border-outline-variant px-2 text-[12px] font-semibold text-secondary">
      v{version}
    </span>
  );
}
