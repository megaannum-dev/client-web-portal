"use client";

/* ============================================================
   MOBO — Trade Reconciliation FLOW VIEW shared primitives
   FG (status glyph/color map) · MPill (model pill) · SDot (status dot)
   Ported from mobo/mobo-app/MoboRecon.jsx (FM/FG constants + SDot/MPill).
   ============================================================ */

import type { LucideIcon } from "lucide-react";
import { Check, X } from "@/lib/icons";
import type { ChipTone } from "@/components/ui/Chip";
import { clientColor } from "@/components/mobo/allocation/Panels";
import type { FlowState, RcModelId } from "@/lib/mobo/flow-types";

export const FG: Record<FlowState, { icon: LucideIcon; bg: string; fg: string; label: string; tone: ChipTone }> = {
  ok: { icon: Check, bg: "#e3f1e7", fg: "#2f7a47", label: "Matched", tone: "active" },
  brk: { icon: X, bg: "#f7ddd6", fg: "#b1402f", label: "Break", tone: "failed" },
};

/** Plain model display name (no pill styling) — for text contexts like KV rows. */
export function modelName(mid: RcModelId): string {
  return mid;
}

/** `mid` is the model's real name straight from the backend (RcOrderOut.m /
 * RcAllocModelLineOut.m) -- there's no fixed model registry to look up
 * anymore, so the pill's color is just hashed from the name (same helper
 * the Post-Trade Allocation bar/donut chart uses for client colors). */
export function MPill({ mid }: { mid: RcModelId }) {
  if (!mid) return null;
  return (
    <span
      className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
      style={{ background: clientColor(mid) }}
    >
      {mid}
    </span>
  );
}

export function SDot({ st, size = 20 }: { st: FlowState; size?: number }) {
  const g = FG[st] ?? FG.ok;
  const Icon = g.icon;
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, background: g.bg, color: g.fg }}
    >
      <Icon size={Math.round(size * 0.55)} strokeWidth={2.25} />
    </span>
  );
}
