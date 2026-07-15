"use client";

/* ============================================================
   MOBO — Trade Reconciliation FLOW VIEW row cards
   OrderCard (row 1) · AllocCard (row 2) · PortfolioCard (row 3)
   FlowRow (row wrapper, "banner" | "inline" label modes) · FlowConnector
   Ported from mobo/mobo-app/MoboRecon.jsx (lines 148-298).
   ============================================================ */

import { useState, type ReactNode, type CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "@/lib/icons";
import { MPill, SDot, FG } from "./shared";
import type { RcOrder, RcAlloc, RcPort, FlowState } from "@/lib/mobo/flow-types";

/* ---- shared card-shell helpers (border / shadow depend on
   selection + hover + break state — genuinely dynamic per card) --- */
function cardBorder(st: FlowState, sel?: boolean, hl?: boolean): string {
  return `1.5px solid ${
    sel ? "var(--primary)" : hl ? "rgba(242,116,5,0.35)" : st !== "ok" ? FG[st].fg : "var(--outline-variant)"
  }`;
}
function cardShadow(sel?: boolean, hov?: boolean): { className: string; style?: CSSProperties } {
  if (sel) return { className: "", style: { boxShadow: "0 0 0 2px rgba(242,116,5,0.15)" } };
  return { className: hov ? "shadow-hover" : "shadow-card" };
}

/* ---- order card --------------------------------------------- */
export function OrderCard({
  o, sel, hl, onClick, compact,
}: {
  o: RcOrder;
  sel?: boolean;
  hl?: boolean;
  onClick?: () => void;
  compact?: boolean;
}) {
  const [hov, setHov] = useState(false);
  const g = FG[o.st];
  const shadow = cardShadow(sel, hov);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={[
        "box-border cursor-pointer rounded-md transition-all duration-150",
        compact ? "w-[156px] min-w-[156px] px-[11px] py-2.5" : "w-[192px] min-w-[192px] px-3.5 py-3",
        o.st === "ok" ? "bg-surface-lowest" : "",
        shadow.className,
      ].join(" ")}
      style={{
        background: o.st !== "ok" ? FG[o.st].bg : undefined,
        border: cardBorder(o.st, sel, hl),
        ...shadow.style,
      }}
    >
      <div className="mb-[5px] flex items-center justify-between gap-[5px]">
        <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-bold text-on-surface">
          {o.ref}
        </span>
        <MPill mid={o.m} />
      </div>
      <div className="text-[13px] font-semibold text-on-surface">{o.inst}</div>
      <div className="mb-2 text-[11.5px] text-secondary">
        {o.side} · {o.qty} @ {o.px}
      </div>
      <div className="flex items-center gap-[5px] border-t border-outline-variant pt-1.5">
        <SDot st={o.st} size={16} />
        <span className="text-[11px] font-semibold" style={{ color: g.fg }}>{g.label}</span>
        <span className="ml-auto text-[10.5px] tabular-nums text-secondary">{o.not}</span>
      </div>
    </div>
  );
}

/* ---- allocation card ----------------------------------------- */
export function AllocCard({
  a, sel, hl, onClick, compact,
}: {
  a: RcAlloc;
  sel?: boolean;
  hl?: boolean;
  onClick?: () => void;
  compact?: boolean;
}) {
  const [hov, setHov] = useState(false);
  const g = FG[a.st];
  const shadow = cardShadow(sel, hov);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={[
        "box-border cursor-pointer rounded-md transition-all duration-150",
        compact ? "w-[164px] min-w-[164px] px-[11px] py-2.5" : "w-[205px] min-w-[205px] px-3.5 py-3",
        a.st === "ok" ? "bg-surface-lowest" : "",
        shadow.className,
      ].join(" ")}
      style={{
        background: a.st !== "ok" ? FG[a.st].bg : undefined,
        border: cardBorder(a.st, sel, hl),
        ...shadow.style,
      }}
    >
      <div className="mb-[7px] text-[14px] font-bold text-on-surface">{a.client}</div>
      <div className="mb-2 flex flex-col gap-[3px]">
        {a.models.map((ma) => (
          <div
            key={ma.m}
            className="flex items-center justify-between gap-[5px] rounded-[6px] bg-[#F3F4F5] px-[7px] py-[3px]"
          >
            <MPill mid={ma.m} />
            <span
              className={`text-[11.5px] font-semibold tabular-nums ${ma.st === "ok" ? "text-on-surface" : ""}`}
              style={ma.st === "ok" ? undefined : { color: FG[ma.st].fg }}
            >
              {ma.amt}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-[5px] border-t border-outline-variant pt-1.5">
        <SDot st={a.st} size={16} />
        <span className="text-[11px] font-semibold" style={{ color: g.fg }}>{g.label}</span>
        <span className="ml-auto text-[10.5px] tabular-nums text-secondary">{a.total}</span>
      </div>
    </div>
  );
}

/* ---- portfolio card -------------------------------------------- */
export function PortfolioCard({
  p, sel, hl, onClick, compact,
}: {
  p: RcPort;
  sel?: boolean;
  hl?: boolean;
  onClick?: () => void;
  compact?: boolean;
}) {
  const [hov, setHov] = useState(false);
  const g = FG[p.st];
  const shadow = cardShadow(sel, hov);
  const cc = p.chg.startsWith("+") ? "#2f7a47" : p.chg.startsWith("-") ? "#b1402f" : "var(--secondary)";
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={[
        "box-border cursor-pointer rounded-md transition-all duration-150",
        compact ? "w-[164px] min-w-[164px] px-[11px] py-2.5" : "w-[205px] min-w-[205px] px-3.5 py-3",
        p.st === "ok" ? "bg-surface-lowest" : "",
        shadow.className,
      ].join(" ")}
      style={{
        background: p.st !== "ok" ? FG[p.st].bg : undefined,
        border: cardBorder(p.st, sel, hl),
        ...shadow.style,
      }}
    >
      <div className="mb-[3px] text-[14px] font-bold text-on-surface">{p.client}</div>
      <div className="mb-[7px] text-[10.5px] font-semibold uppercase tracking-[0.04em] text-secondary">
        New Portfolio Info
      </div>
      <div className="mb-[3px] flex items-baseline justify-between gap-1.5">
        <span className="text-[17px] font-bold tabular-nums text-on-surface">{p.post}</span>
        <span className="text-[11.5px] font-bold tabular-nums" style={{ color: cc }}>{p.chg}</span>
      </div>
      <div className="mb-1.5 text-[11px] text-secondary">
        from {p.pre} · <span style={{ color: cc }}>{p.pct}</span>
      </div>
      <div className="mt-1 flex items-center gap-[5px] border-t border-outline-variant pt-1.5">
        <SDot st={p.st} size={16} />
        <span className="text-[11px] font-semibold" style={{ color: g.fg }}>{g.label}</span>
      </div>
    </div>
  );
}

/* ---- flow row --------------------------------------------------
   Wraps one row's cards. "banner" = title bar above a horizontally
   scrolling strip. Default/"inline" = a fixed-width label column
   beside the scrolling strip — this is the mode the flow page
   actually uses, so it must be pixel-faithful. */
export function FlowRow({
  label, icon: Icon, sub, children, labelMode, hasBreaks,
}: {
  label: string;
  icon?: LucideIcon;
  sub?: string;
  children: ReactNode;
  labelMode?: "banner" | "inline";
  hasBreaks?: boolean;
}) {
  const rowBg = hasBreaks ? "rgba(186,26,26,0.04)" : "rgba(47,122,71,0.04)";
  const rowBorder = hasBreaks ? "1.5px solid rgba(186,26,26,0.18)" : "1.5px solid rgba(47,122,71,0.12)";

  /* split sub into text + amount (after last " · ") */
  const subParts = sub ? sub.split(" · ") : [];
  const subText = subParts.length > 1 ? subParts.slice(0, -1).join(" · ") : sub;
  const subAmt = subParts.length > 1 ? subParts[subParts.length - 1] : null;
  const amtColor = hasBreaks ? "#b1402f" : "#2f7a47";

  if (labelMode === "banner") {
    return (
      <div className="overflow-hidden rounded-[14px]" style={{ background: rowBg, border: rowBorder }}>
        <div className="flex items-center gap-2 border-b border-outline-variant px-4 py-2.5">
          {Icon && (
            <span className="flex text-secondary">
              <Icon size={16} strokeWidth={1.75} />
            </span>
          )}
          <span className="text-[15px] font-bold text-on-surface">{label}</span>
          {sub && <span className="text-[11.5px] text-secondary">{subText}</span>}
          {subAmt && (
            <span className="text-[13px] font-bold tabular-nums" style={{ color: amtColor }}>{subAmt}</span>
          )}
        </div>
        <div className="flex gap-3 overflow-x-auto px-4 py-3.5">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 rounded-[14px] px-4 py-3.5" style={{ background: rowBg, border: rowBorder }}>
      <div className="flex items-start gap-4">
        <div className="w-[90px] flex-none pt-0.5">
          <div className="mb-[3px] flex items-center gap-1.5">
            {Icon && (
              <span className="flex text-secondary">
                <Icon size={15} strokeWidth={1.75} />
              </span>
            )}
          </div>
          <span className="text-[15px] font-bold leading-[1.2] text-on-surface">{label}</span>
          {subText && <div className="mt-[3px] text-[10px] leading-[1.3] text-secondary">{subText}</div>}
          {subAmt && (
            <div className="mt-1 text-[13px] font-bold tabular-nums" style={{ color: amtColor }}>{subAmt}</div>
          )}
        </div>
        <div className="flex flex-1 gap-2.5 overflow-x-auto pb-1">{children}</div>
      </div>
    </div>
  );
}

/* ---- flow connector — small chevron-down row between rows ---- */
export function FlowConnector({ count }: { count: number }) {
  return (
    <div className="flex justify-center gap-8 py-1 pl-[106px]">
      {Array.from({ length: Math.min(count, 6) }).map((_, i) => (
        <ChevronDown key={i} size={14} strokeWidth={2} className="text-outline" />
      ))}
    </div>
  );
}
