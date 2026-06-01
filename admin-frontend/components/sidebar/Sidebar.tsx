"use client";
import { SidebarLogo }   from "./SidebarLogo";
import { SidebarNav }    from "./SidebarNav";
import { SidebarFooter } from "./SidebarFooter";

interface SidebarProps {
  isOpen: boolean;
  width: number;
  isDragging: boolean;
  onToggle: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
}

export function Sidebar({ isOpen, width, isDragging, onToggle, onResizeStart }: SidebarProps) {
  return (
    <aside
      className={[
        "fixed inset-y-0 left-0 z-30 flex flex-col overflow-hidden",
        "bg-surface-lowest border-r border-outline-variant",
        // Only animate transform (open/close). Width changes via inline style are instant.
        isDragging ? "" : "transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "-translate-x-full",
      ].join(" ")}
      style={{ width }}
    >
      <SidebarLogo isOpen={isOpen} onToggle={onToggle} />
      <SidebarNav  isOpen={isOpen} />
      <SidebarFooter isOpen={isOpen} />

      {/* Resize handle — straddles the right border for an easy grab target */}
      <div
        onMouseDown={onResizeStart}
        className={[
          "absolute top-0 bottom-0 -right-1 w-3 z-10",
          "cursor-col-resize select-none",
          "group flex items-stretch justify-center",
        ].join(" ")}
      />
    </aside>
  );
}