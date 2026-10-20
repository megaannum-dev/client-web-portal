import { useState, useCallback, useEffect } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export type ResizeEdge = "top" | "left" | "top-left";

interface Size {
  width: number;
  height: number;
}

// Default room left between the box and the viewport edges at max size.
const DEFAULT_RESERVED: Size = { width: 32, height: 32 };

function clamp(size: Size, min: Size, reserved: Size): Size {
  const maxW = Math.max(min.width, window.innerWidth - reserved.width);
  const maxH = Math.max(min.height, window.innerHeight - reserved.height);
  return {
    width: Math.min(Math.max(size.width, min.width), maxW),
    height: Math.min(Math.max(size.height, min.height), maxH),
  };
}

function readStored(key: string): Size | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Size>;
    return typeof parsed.width === "number" && typeof parsed.height === "number"
      ? { width: parsed.width, height: parsed.height }
      : null;
  } catch {
    return null;
  }
}

/**
 * Width + height resizing for a box pinned to the bottom-right corner, so it
 * grows from its top and left edges: dragging left/up makes it bigger. The
 * last size is remembered in localStorage under `storageKey`. `reserved` is the
 * viewport width/height the box must leave free — its max size is the rest.
 */
export function useResizableBox(
  storageKey: string,
  defaultSize: Size,
  minSize: Size,
  reserved: Size = DEFAULT_RESERVED,
) {
  const [size, setSize] = useState<Size>(defaultSize);
  const [isDragging, setIsDragging] = useState(false);

  // Read after mount — localStorage and window don't exist during SSR.
  useEffect(() => {
    setSize(clamp(readStored(storageKey) ?? defaultSize, minSize, reserved));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Keep the box inside its bounds when the window shrinks or `reserved` grows
  // (e.g. the sidebar beside it is dragged wider).
  useEffect(() => {
    const onResize = () => setSize((s) => clamp(s, minSize, reserved));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [minSize, reserved]);

  const handleResizeStart = useCallback(
    (edge: ResizeEdge) => (e: ReactPointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      // Start from the box's rendered size, not `size`: the caller may be
      // showing it at some other size (ChatPopup's maximized layout). Handles
      // are direct children of the box.
      const rect = (e.currentTarget as HTMLElement).parentElement?.getBoundingClientRect();
      const start = rect ? { width: rect.width, height: rect.height } : size;
      let latest = start;
      setSize(start);

      setIsDragging(true);
      document.body.style.userSelect = "none";
      document.body.style.cursor = edge === "top" ? "ns-resize" : edge === "left" ? "ew-resize" : "nwse-resize";

      const onPointerMove = (ev: PointerEvent) => {
        latest = clamp(
          {
            width: edge === "top" ? start.width : start.width + (startX - ev.clientX),
            height: edge === "left" ? start.height : start.height + (startY - ev.clientY),
          },
          minSize,
          reserved,
        );
        setSize(latest);
      };

      const onPointerUp = () => {
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        setIsDragging(false);
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(latest));
        } catch {
          // Storage blocked (private mode etc.) — the size just won't persist.
        }
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
      };

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    },
    [size, minSize, reserved, storageKey],
  );

  return { size, isDragging, handleResizeStart };
}
