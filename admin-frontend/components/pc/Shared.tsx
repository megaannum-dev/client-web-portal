"use client";

/* ============================================================
   PC shared workspace primitives
   Eyebrow · StatusChip · Ticks · VerBadge · Modal · Fact · FeeCalc
   Ported faithfully from the design prototype (ModelManagement.jsx /
   AllocationMatrix.jsx). Reuses the repo's Button/Chip primitives.
   ============================================================ */

import { useState, type ReactNode } from "react";
import { Upload, FileText, X } from "@/lib/icons";
import { Chip } from "@/components/ui/Chip";
import { fmtMoney, computeFees } from "@/lib/pc/format";
import type { Model, ModelStatus } from "@/lib/pc/types";

/* ---- Eyebrow — uppercase section label (MmEyebrow / amLabel) */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={[
        "mb-2.5 text-[11px] font-bold uppercase tracking-[0.05em] text-secondary",
        className,
      ].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  );
}

/* ---- StatusChip — model lifecycle pill --------------------- */
export function StatusChip({ status }: { status: ModelStatus }) {
  return status === "draft" ? (
    <Chip tone="warm" dot>Draft</Chip>
  ) : (
    <Chip tone="active" dot>Live</Chip>
  );
}

/* ---- Ticks — wrapping row of symbol pills ------------------
   `onRemove` is optional: when supplied (e.g. the New-model symbol
   editor) each pill grows a remove affordance; existing read-only
   callers pass nothing and are unaffected. */
export function Ticks({ symbols, onRemove }: { symbols: string[]; onRemove?: (s: string) => void }) {
  return (
    <div className="flex flex-wrap gap-[5px]">
      {symbols.map((s) => (
        <span
          key={s}
          className="inline-flex items-center gap-1 rounded-[6px] bg-surface-container px-2 py-[3px] text-[12px] font-bold tabular-nums text-on-surface"
        >
          {s}
          {onRemove && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(s); }}
              aria-label={`Remove ${s}`}
              className="-mr-0.5 flex cursor-pointer text-secondary transition-colors hover:text-on-surface"
            >
              <X size={11} strokeWidth={2.5} />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

/* ---- VerBadge — material version pill ---------------------- */
export function VerBadge({ version, none }: { version: string; none?: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-[5px] rounded px-[9px] py-[3px] text-[12px] font-bold",
        none ? "bg-surface-container text-secondary" : "bg-primary-fixed text-primary",
      ].join(" ")}
    >
      {none ? <Upload size={12} strokeWidth={2} /> : <FileText size={12} strokeWidth={2} />}
      {none ? "no materials" : version}
    </span>
  );
}

/* ---- Modal — shared modal shell (Modal / AmModal) ----------
   Positions ABSOLUTELY so it scopes to the page wrapper (the screens
   render inside a `relative` container). */
export function Modal({
  title, subtitle, onClose, children, footer, width = 620, centered = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  centered?: boolean;
}) {
  return (
    <>
      <div
        onClick={onClose}
        className="absolute inset-0 z-[12]"
        style={{ background: "rgba(40,38,34,0.34)", backdropFilter: "blur(2px)" }}
      />
      <div
        className="absolute left-1/2 z-[13] flex flex-col overflow-hidden rounded-[18px] bg-surface-lowest shadow-overlay"
        style={{
          top: centered ? "50%" : 40,
          transform: centered ? "translate(-50%,-50%)" : "translateX(-50%)",
          width,
          maxWidth: "calc(100% - 40px)",
          maxHeight: "calc(100% - 80px)",
        }}
      >
        <div className="flex flex-none items-start justify-between gap-3.5 border-b border-outline-variant px-[22px] py-[18px]">
          <div>
            <div className="text-[19px] font-bold tracking-[-0.01em]">{title}</div>
            {subtitle && <div className="mt-1 text-[13px] text-secondary">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex cursor-pointer p-[3px] text-secondary"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="overflow-y-auto px-[22px] py-5">{children}</div>
        {footer && (
          <div className="flex flex-none items-center gap-2.5 border-t border-outline-variant bg-surface-low px-[22px] py-[15px]">
            {footer}
          </div>
        )}
      </div>
    </>
  );
}

/* ---- Fact — small labelled fact box (FactGrid / DetailPanel) */
export function Fact({
  label, value, sub, span, className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  span?: boolean;
  className?: string;
}) {
  return (
    <div
      className={["rounded-[10px] bg-surface-low px-[13px] py-[11px]", className].filter(Boolean).join(" ")}
      style={span ? { gridColumn: "1 / -1" } : undefined}
    >
      <div className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary">{label}</div>
      <div className="mt-1.5 text-[16px] font-bold tabular-nums text-on-surface">
        {value}
        {sub && <span className="ml-[5px] text-[12px] font-semibold text-secondary">{sub}</span>}
      </div>
    </div>
  );
}

/* ============================================================
   FEE CALCULATOR (used inside the Model Management calc modal)
   ============================================================ */
export function FeeCalc({ initialModelId, models }: { initialModelId?: string; models: Model[] }) {
  const live = models.filter((x) => x.status === "live");
  const [modelId, setModelId] = useState(initialModelId ?? (live[0]?.id ?? models[0]?.id ?? ""));
  const [perf, setPerf] = useState(5);
  const [hurdle, setHurdle] = useState(2);

  const m = models.find((x) => x.id === modelId) ?? live[0] ?? models[0];
  if (!m) return null;
  const f = computeFees(m, perf, hurdle);

  const labelCls = "text-[11px] font-bold uppercase tracking-[0.05em] text-secondary";
  const fieldCls =
    "box-border w-full rounded border border-outline-variant bg-white px-3 py-2.5 text-[15px] text-on-surface outline-none";

  const lines: [string, string][] = [
    [`Management fee · ${m.mgmt}% × ${fmtMoney(m.size)}`, fmtMoney(Math.round(f.mgmtFee))],
    [`Incentive fee · ${m.incentive}% × ${f.excess}% excess × model size`, fmtMoney(Math.round(f.incFee))],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[10px] bg-surface-low px-[15px] py-[13px] text-[13.5px] leading-[1.65] text-secondary">
        <b className="text-on-surface">Management fee</b> = Management Rate (%) × Model size<br />
        <b className="text-on-surface">Incentive fee</b> = Incentive Rate (%) × max(Performance − Hurdle, 0) × Model size
      </div>
      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Select model</span>
        <select
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          className={`${fieldCls} cursor-pointer`}
        >
          {live.map((x) => (
            <option key={x.id} value={x.id}>{x.name} · {fmtMoney(x.size)}</option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Performance (%)</span>
          <input
            type="number"
            value={perf}
            onChange={(e) => setPerf(parseFloat(e.target.value) || 0)}
            className={fieldCls}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Hurdle (%)</span>
          <input
            type="number"
            value={hurdle}
            onChange={(e) => setHurdle(parseFloat(e.target.value) || 0)}
            className={fieldCls}
          />
        </label>
      </div>
      <div className="rounded-md bg-primary-fixed px-4 py-3.5">
        {lines.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 py-1.5 text-[13.5px]">
            <span className="text-secondary">{k}</span>
            <span className="font-bold tabular-nums">{v}</span>
          </div>
        ))}
        <div
          className="mt-[5px] flex justify-between gap-3 pt-[11px]"
          style={{ borderTop: "1px solid rgba(242,116,5,0.3)" }}
        >
          <span className="font-bold">Estimated annual fee</span>
          <span className="text-[19px] font-bold tabular-nums text-primary">{fmtMoney(Math.round(f.total))}</span>
        </div>
      </div>
      <p className="m-0 text-[12px] leading-[1.5] text-secondary">
        Fee formulas are illustrative and do not replace the legal fee schedule.
      </p>
    </div>
  );
}
