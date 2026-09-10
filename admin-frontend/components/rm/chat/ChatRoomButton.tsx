"use client";

// 021 UI-4 — the round "open the Client Room" trigger button.
import clsx from "clsx";
import { MessagesSquare } from "@/lib/icons";

export function ChatRoomButton({
  onClick, size = 36, label,
}: {
  onClick: () => void;
  size?: number;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label ?? "Open Client Room"}
      // The design calls e.stopPropagation() before its own onClick — this
      // button is used inline in a clickable client-book row (UI-5), and
      // must not also fire the row's own navigation.
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={clsx(
        "inline-flex flex-none items-center justify-center gap-2 rounded-full border-none bg-primary/10 text-[13px] font-semibold text-primary transition-all duration-150 hover:bg-primary hover:text-white hover:shadow-hover",
        label && "w-auto px-3.5",
      )}
      style={label ? { height: size } : { width: size, height: size }}
    >
      <MessagesSquare size={size >= 36 ? 19 : 16} strokeWidth={2} />
      {label && <span>{label}</span>}
    </button>
  );
}
