"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PanelLeftOpen } from "@/lib/icons";
import { useResizable } from "@/lib/hooks/useResizable";
import { Sidebar } from "./sidebar/Sidebar";
import { Header } from "./header/Header";
import { FloatingActionButton } from "./ui/FloatingActionButton";

const DEFAULT_WIDTH    = 256;
const MIN_WIDTH        = 180;
const MAX_WIDTH        = 360;
const COLLAPSED_GUTTER = 32;
const NARROW_BREAKPOINT = 768; // Tailwind md

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { open, setOpen, width, isDragging, handleResizeStart } = useResizable(
    DEFAULT_WIDTH,
    MIN_WIDTH,
    MAX_WIDTH,
  );
  const { t } = useTranslation();

  // On narrow screens the sidebar would eat most of the width, so start it
  // collapsed there and fold it away when the window shrinks past md.
  useEffect(() => {
    const narrow = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT - 1}px)`);
    if (narrow.matches) setOpen(false);
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) setOpen(false); };
    narrow.addEventListener("change", onChange);
    return () => narrow.removeEventListener("change", onChange);
  }, [setOpen]);

  return (
    <>
      <Sidebar
        isOpen={open}
        width={width}
        isDragging={isDragging}
        onToggle={() => setOpen(false)}
        onResizeStart={handleResizeStart}
      />

      {/* Orange expand tab — shown only when sidebar is hidden */}
      <button
        type="button"
        aria-label={t("nav.open_sidebar")}
        onClick={() => setOpen(true)}
        className={[
          "fixed left-0 top-5 z-40",
          "flex items-center justify-center",
          "bg-primary text-white",
          "px-1.5 py-3 rounded-r-lg shadow-overlay",
          "hover:bg-primary/90 transition-all duration-300 ease-in-out",
          open
            ? "opacity-0 pointer-events-none -translate-x-full"
            : "opacity-100 translate-x-0",
        ].join(" ")}
      >
        <PanelLeftOpen size={18} strokeWidth={2} />
      </button>

      {/* Main area — padding tracks sidebar width; transition only when not dragging */}
      <div
        className={[
          "flex flex-col",
          isDragging ? "" : "transition-[padding-left] duration-300 ease-in-out",
        ].join(" ")}
        style={{ paddingLeft: open ? width : COLLAPSED_GUTTER }}
      >
        <Header />
        <main className="flex-1 min-w-0 p-4 sm:p-8">{children}</main>
      </div>
      <FloatingActionButton sidebarWidth={open ? width : COLLAPSED_GUTTER} />
    </>
  );
}
