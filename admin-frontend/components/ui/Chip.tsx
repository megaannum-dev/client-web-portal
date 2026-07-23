import type { ReactNode } from "react";

export type ChipTone =
  | "active"
  | "pending"
  | "review"
  | "failed"
  | "overdue"
  | "neutral"
  | "warm";

/** Exact tones from the design kit (Primitives.jsx · CHIP_TONES). */
const CHIP_TONES: Record<ChipTone, { bg: string; fg: string; dot: string }> = {
  active:  { bg: "#f0fdf4", fg: "#15803d", dot: "#16a34a" },
  pending: { bg: "#fff7ed", fg: "#c2410c", dot: "#ea580c" },
  review:  { bg: "#eef2f7", fg: "#29303c", dot: "#585f6c" },
  failed:  { bg: "#ffdad6", fg: "#93000a", dot: "#ba1a1a" },
  overdue: { bg: "#ffebee", fg: "#b71c1c", dot: "#d32f2f" },
  neutral: { bg: "#f3f4f5", fg: "#5f5e5e", dot: "#8b7264" },
  warm:    { bg: "#fff3e8", fg: "#994700", dot: "#f27405" },
};

interface ChipProps {
  tone?: ChipTone;
  dot?: boolean;
  children: ReactNode;
}

export function Chip({ tone = "neutral", dot = true, children }: ChipProps) {
  const t = CHIP_TONES[tone] ?? CHIP_TONES.neutral;
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[12px] font-semibold whitespace-nowrap"
      style={{ background: t.bg, color: t.fg }}
    >
      {dot && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: t.dot }}
        />
      )}
      {children}
    </span>
  );
}
