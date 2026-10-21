"use client";

import { useMemo, useState } from "react";
import { useResizableBox, type ResizeEdge, type Size } from "@/lib/hooks/useResizableBox";

const DEFAULT_SIZE: Size = { width: 420, height: 600 };
const MIN_SIZE: Size     = { width: 360, height: 420 };
// Gap kept from the sidebar and the top of the viewport at max size.
const MAXIMIZED_MARGIN = 24;
// The panel is pinned right-8 (32px). The FAB stays in the bottom-right corner
// while a panel is open (its quick actions must stay reachable), so the
// panel's bottom edge clears it:
// bottom-8 (32) + FAB pill (10 + 56 + 10) + a 16px gap = 124 = bottom-[124px].
const RIGHT_OFFSET  = 32;
const BOTTOM_OFFSET = 124;

// Invisible grab zones along the edges that face the page. The panel is pinned
// bottom-right, so only the top and left edges (and their corner) move.
const HANDLES: { edge: ResizeEdge; className: string }[] = [
  { edge: "top",      className: "top-0 left-3 right-0 h-1.5 cursor-ns-resize" },
  { edge: "left",     className: "left-0 top-3 bottom-0 w-1.5 cursor-ew-resize" },
  { edge: "top-left", className: "top-0 left-0 size-3 cursor-nwse-resize" },
];

export interface FloatingPanelControls {
  maximized: boolean;
  toggleMaximize: () => void;
}

/**
 * The floating window the FAB opens panels in (chat, FAQ): pinned above the
 * FAB, resizable from its top/left edges, maximizable to the area beside the
 * sidebar, and poured out of the FAB on open. Content is a render prop so it
 * can place the maximize control in its own header.
 */
export function FloatingPanel({
  label,
  storageKey,
  sidebarWidth = 0,
  children,
}: {
  /** Accessible name of the dialog. */
  label: string;
  /** localStorage key for the remembered size — one per panel. */
  storageKey: string;
  /** Maximized, the panel starts where the sidebar ends rather than covering it. */
  sidebarWidth?: number;
  children: (controls: FloatingPanelControls) => React.ReactNode;
}) {
  // The maximized area is the resize boundary: the panel can only ever be
  // dragged smaller than it, never past the sidebar gap or the top margin.
  const reserved = useMemo(
    () => ({
      width: sidebarWidth + MAXIMIZED_MARGIN + RIGHT_OFFSET,
      height: MAXIMIZED_MARGIN + BOTTOM_OFFSET,
    }),
    [sidebarWidth],
  );
  const { size, handleResizeStart } = useResizableBox(storageKey, DEFAULT_SIZE, MIN_SIZE, reserved);
  // Maximized fills that boundary; restoring returns to the last dragged size,
  // which useResizableBox keeps untouched meanwhile. Dragging an edge while
  // maximized drops back to a window, starting from the maximized size.
  const [maximized, setMaximized] = useState(false);

  return (
    <div
      role="dialog"
      aria-label={label}
      className={[
        // z-40: under the FAB and its click-away backdrop (both z-40/50, later in the DOM).
        "fixed z-40 right-8 bottom-[124px] overflow-hidden rounded-xl shadow-overlay border border-outline-variant",
        // Plays once on mount (opening only); toggling maximize keeps the
        // same animation name, so it does not replay.
        "animate-genie-in",
      ].join(" ")}
      style={
        // Maximized still floats with a margin all round, so the page behind
        // stays visible and sidebar navigation doesn't look like a frozen app.
        maximized
          ? { left: sidebarWidth + MAXIMIZED_MARGIN, top: MAXIMIZED_MARGIN }
          : { width: size.width, height: size.height }
      }
    >
      {children({ maximized, toggleMaximize: () => setMaximized((v) => !v) })}
      {HANDLES.map(({ edge, className }) => (
        <div
          key={edge}
          aria-hidden
          onPointerDown={(e) => {
            setMaximized(false);
            handleResizeStart(edge)(e);
          }}
          className={`absolute z-10 touch-none ${className}`}
        />
      ))}
    </div>
  );
}
