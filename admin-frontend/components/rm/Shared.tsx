"use client";

/* ============================================================
   RM shared workspace primitives
   Modal
   Ported faithfully from the design handoff prototype (Screens.jsx
   modals), following the components/pc/Shared.tsx Modal pattern.
   ============================================================ */

import type { ReactNode } from "react";
import { X } from "@/lib/icons";

/* ---- Modal — shared modal shell -----------------------------
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
        className="absolute left-1/2 z-[13] flex flex-col overflow-hidden rounded-[18px] bg-surface-lowest shadow-overlay transition-transform duration-200 ease-out"
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
