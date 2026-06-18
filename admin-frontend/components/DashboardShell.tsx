"use client";

import { PanelLeftOpen } from "@/lib/icons";
import { useResizable }  from "@/lib/hooks/useResizable";
import { Sidebar } from "./sidebar/Sidebar";
import { Header } from "./header/Header";

const DEFAULT_WIDTH    = 256;
const MIN_WIDTH        = 180;
const MAX_WIDTH        = 360;
const COLLAPSED_GUTTER = 32;

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { open, setOpen, width, isDragging, handleResizeStart } = useResizable(
    DEFAULT_WIDTH,
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
      {/* <FloatingActionButton /> */}
    </>
  );
}
