"use client";

import { PanelLeftOpen } from "@/lib/icons";
import { useResizable }  from "@/hooks/api/useResizable";
import { Sidebar } from "./sidebar/Sidebar";
import { Header } from "./header/Header";

const MIN_WIDTH        = 180;
const MAX_WIDTH        = 360;
const COLLAPSED_GUTTER = 32;

function getDefaultWidth() {
  if (typeof window === "undefined") return 256;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(window.innerWidth * 0.18)));
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { open, setOpen, width, isDragging, handleResizeStart } = useResizable(
    getDefaultWidth(),
    MIN_WIDTH,
    MAX_WIDTH,
  );

  return (
    <>
      <Sidebar
        isOpen={open}
        width={width}
        isDragging={isDragging}
        onToggle={() => setOpen((prev) => !prev)}
        onResizeStart={handleResizeStart}
      />

      {/* Orange expand tab — shown only when sidebar is hidden */}
      <button
        type="button"
        aria-label="Open sidebar"
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
        <main className="flex-1 p-8 px-16 h-{100%}">{children}</main>
      </div>

      {/*
        Stable overlay root — pinned to the viewport-visible content area
        (excludes the sidebar and header), independent of how tall any given
        page's own content grows. Modals (e.g. components/rm/Shared.tsx)
        portal into this instead of positioning relative to their page's own
        content wrapper, so they don't drift when accordions/tables expand
        below them.
      */}
      <div
        id="content-overlay-root"
        className={["fixed bottom-0 right-0 top-header-h z-40", isDragging ? "" : "transition-[left] duration-300 ease-in-out"].join(" ")}
        style={{ left: open ? width : COLLAPSED_GUTTER, pointerEvents: "none" }}
      />
      {/* <FloatingActionButton /> */}
    </>
  );
}
