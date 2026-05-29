"use client";

import { SidebarContext } from "./SidebarContext";
import { SidebarLogo }    from "./SidebarLogo";
import { SidebarNav }     from "./SidebarNav";
import { SidebarFooter }  from "./SidebarFooter";

/** Width of the collapsed icon rail. Matches one icon + symmetric padding. */
export const RAIL_WIDTH = 56;

interface SidebarProps {
  isOpen: boolean;
  width: number;
  isDragging: boolean;
  onToggle: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
}

export function Sidebar({ isOpen, width, isDragging, onToggle, onResizeStart }: SidebarProps) {
  return (
    <SidebarContext.Provider value={isOpen}>
      <aside
        className={[
          "fixed inset-y-0 left-0 z-30 flex flex-col overflow-hidden",
          "bg-surface-lowest border-r border-outline-variant",
          // Animate width on open/close; suppress transition while drag-resizing.
          isDragging ? "" : "transition-[width] duration-300 ease-in-out",
        ].join(" ")}
        style={{ width: isOpen ? width : RAIL_WIDTH }}
      >
        <SidebarLogo onToggle={onToggle} />
        <SidebarNav />
        <SidebarFooter />

        {/* Resize handle — only active when expanded */}
        {isOpen && (
          <div
            onMouseDown={onResizeStart}
            className="absolute top-0 bottom-0 -right-1 w-3 z-10 cursor-col-resize select-none"
          />
        )}
      </aside>
    </SidebarContext.Provider>
  );
}
