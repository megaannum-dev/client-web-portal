"use client";

/* ============================================================
   Compliance workspace — shared primitives
   Ported faithfully from the design prototype (ComplianceReview.jsx).
   Reuses the repo Chip primitive; inline styles use the globals.css
   token aliases (var(--primary) etc.).
   ============================================================ */

import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { X, Minus } from "@/lib/icons";
import { Chip } from "@/components/ui/Chip";
import { clientInitial } from "@/lib/compliance/mock";
import type { AllotRdmpStatus, DocumentDTO, ObStatus } from "@/lib/onboarding/types";

/* uppercase micro-label — matches the prototype's coLabel */
export const coLabelCls =
  "text-[11px] font-bold uppercase tracking-[0.05em] text-secondary";

/* ---- status chips ----------------------------------------- */
export function ObStatusChip({ status }: { status: ObStatus }) {
  if (status === "pending") return <Chip tone="pending">Pending review</Chip>;
  if (status === "approved") return <Chip tone="active">Approved</Chip>;
  if (status === "rejected") return <Chip tone="failed">Rejected</Chip>;
  return <Chip tone="neutral">{status}</Chip>;
}
export function ObTypeChip({ type }: { type: string }) {
  return type === "Yearly Renewal"
    ? <Chip tone="review" dot={false}>Renewal</Chip>
    : <Chip tone="warm" dot={false}>Initial</Chip>;
}
export function CrStatusChip({ status }: { status: AllotRdmpStatus }) {
  if (status === "awaiting_co") return <Chip tone="pending">Awaiting compliance</Chip>;
  if (status === "awaiting_pc") return <Chip tone="review">Awaiting PC sign-off</Chip>;
  if (status === "approved") return <Chip tone="active">Approved</Chip>;
  if (status === "rejected") return <Chip tone="failed">Rejected</Chip>;
  return <Chip tone="neutral">{status}</Chip>;
}

/* ---- client avatar (small square, initials) ---------------- */
export function ClientAvatar({ name, size = 34 }: { name: string; size?: number }) {
  return (
    <div
      className="flex flex-none items-center justify-center font-bold"
      style={{
        width: size, height: size, borderRadius: 9,
        background: "var(--primary-fixed)", color: "var(--primary)",
        fontSize: size * 0.36, letterSpacing: "0.02em",
      }}
    >
      {clientInitial(name)}
    </div>
  );
}

/* ---- doc completeness pill --------------------------------- */
export function DocProgress({ documents }: { documents: DocumentDTO[] }) {
  const ok = documents.filter((d) => d.status === "verified").length;
  const clean = ok === documents.length;
  return (
    <span className="text-[13px] font-bold tabular-nums" style={{ color: clean ? "#15803d" : "#c2410c" }}>
      {ok}/{documents.length}
    </span>
  );
}

/* ---- stat strip card --------------------------------------- */
export function StatCard({ icon: Icon, k, v, vColor }: { icon: LucideIcon; k: string; v: ReactNode; vColor?: string }) {
  return (
    <div className="rounded-[14px] border border-outline-variant bg-surface-lowest px-4 py-3.5 shadow-card">
      <div className={`flex items-center gap-1.5 ${coLabelCls}`}>
        <Icon size={13} strokeWidth={2} />{k}
      </div>
      <div
        className="mt-2 text-[24px] font-bold tabular-nums tracking-[-0.02em]"
        style={{ color: vColor || "var(--on-surface)" }}
      >
        {v}
      </div>
    </div>
  );
}

/* ============================================================
   DETAIL SHELL + parts (shared by onboarding & redemption panels)
   ============================================================ */
export function DetailShell({
  eyebrow, title, meta, statusSlot, onClose, children,
}: {
  eyebrow: string;
  title: string;
  meta: string;
  statusSlot: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div onClick={onClose} className="absolute inset-0 z-[8]" style={{ background: "rgba(40,38,34,0.18)" }} />
      <div
        className="absolute bottom-[18px] right-[18px] top-[18px] z-[9] flex flex-col overflow-hidden rounded-[18px] border border-outline-variant bg-surface-lowest shadow-overlay"
        style={{ width: 452, maxWidth: "calc(100% - 36px)" }}
      >
        <div className="flex-none border-b border-outline-variant px-[22px] pb-4 pt-[18px]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={`mb-1 ${coLabelCls}`}>{eyebrow}</div>
              <div className="text-[19px] font-bold tracking-[-0.01em]">{title}</div>
              <div className="mt-1 text-[13px] text-secondary">{meta}</div>
            </div>
            <div className="flex flex-none items-center gap-2.5">
              {statusSlot}
              <button type="button" onClick={onClose} aria-label="Close" className="flex cursor-pointer p-[3px] text-secondary">
                <X size={18} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-[22px] py-5">{children}</div>
      </div>
    </>
  );
}

export function Fact({ k, v, span2, vSize }: { k: string; v: ReactNode; span2?: boolean; vSize?: number }) {
  return (
    <div className="rounded-[10px] bg-surface-low px-[13px] py-[11px]" style={span2 ? { gridColumn: "1 / -1" } : undefined}>
      <div className={coLabelCls}>{k}</div>
      <div className="mt-1.5 font-bold tabular-nums text-on-surface" style={{ fontSize: vSize || 16 }}>{v}</div>
    </div>
  );
}

const NOTICE_TONES: Record<string, { bg: string; fg: string }> = {
  info: { bg: "#eef2f7", fg: "#29303c" },
  bad: { bg: "#ffeceb", fg: "#93000a" },
  warn: { bg: "#FDF4E7", fg: "#994700" },
};
export function Notice({ tone, icon: Icon, children }: { tone: "info" | "bad" | "warn"; icon: LucideIcon; children: ReactNode }) {
  const t = NOTICE_TONES[tone] || NOTICE_TONES.info;
  return (
    <div className="flex gap-2.5 rounded-[10px] px-3.5 py-3 text-[13px] leading-[1.55]" style={{ background: t.bg, color: t.fg }}>
      <Icon size={16} strokeWidth={2} className="mt-px flex-none" />
      <div>{children}</div>
    </div>
  );
}

export function SectionLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className={`mb-2 ${coLabelCls}`} style={style}>{children}</div>;
}

/* re-export so panels can use the "unreviewed" glyph without re-importing */
export const UnreviewedIcon = Minus;
