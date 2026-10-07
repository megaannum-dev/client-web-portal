"use client";

import clsx from "clsx";
import { Check } from "@/lib/icons";

/** Prototype checkbox: 16px, radius 4, 1.5px border, primary fill + white check when on. */
export function CcCheck({ on, onChange, label, className }: { on: boolean; onChange: (v: boolean) => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onChange(!on); }}
      className={clsx(
        "flex h-4 w-4 flex-none items-center justify-center rounded-[4px] border-[1.5px] text-white transition-opacity",
        on ? "border-primary bg-primary" : "border-outline bg-white",
        className,
      )}
    >
      {on && <Check size={11} strokeWidth={3} />}
    </button>
  );
}
