import { useState, useCallback } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

export function useResizable(defaultWidth: number, minWidth: number, maxWidth: number) {
  const [open,       setOpen]       = useState(true);
  const [width,      setWidth]      = useState(defaultWidth);
  const [isDragging, setIsDragging] = useState(false);

  const handleResizeStart = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      const startX     = e.clientX;
      const startWidth = width;

      setIsDragging(true);
      document.body.style.userSelect = "none";
      document.body.style.cursor     = "col-resize";

      const onMouseMove = (ev: MouseEvent) => {
        const next = startWidth + (ev.clientX - startX);
        setWidth(Math.min(Math.max(next, 40), maxWidth));
      };

      const onMouseUp = (ev: MouseEvent) => {
        document.body.style.userSelect = "";
        document.body.style.cursor     = "";
        setIsDragging(false);

        const finalWidth = startWidth + (ev.clientX - startX);
        if (finalWidth < minWidth) {
          setOpen(false);
          setWidth(defaultWidth);
        } else {
          setWidth(Math.min(Math.max(finalWidth, minWidth), maxWidth));
        }

        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup",   onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup",   onMouseUp);
    },
    [width, defaultWidth, minWidth, maxWidth],
  );

  return { open, setOpen, width, isDragging, handleResizeStart };
}
