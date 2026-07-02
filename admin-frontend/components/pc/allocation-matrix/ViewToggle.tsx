"use client";

export type Toggle = "units" | "pct";

/* ============================================================
   VIEW TOGGLE  ·  × Units / % Share
   ============================================================ */
export function ViewToggle({ view, onView }: { view: Toggle; onView: (v: Toggle) => void }) {
  const opts: [Toggle, string][] = [["units", "× Units"], ["pct", "% Share"]];
  return (
    <div
      className="flex overflow-hidden rounded border border-outline"
      title="Show each allocation as a multiplier or its share of the model"
    >
      {opts.map(([k, l]) => (
        <button
          key={k}
          type="button"
          onClick={() => onView(k)}
          className={[
            "box-border flex h-10 cursor-pointer items-center justify-center px-[15px] text-[13.5px] font-bold transition-all duration-150",
            view === k ? "bg-primary text-white" : "bg-white text-secondary",
          ].join(" ")}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
