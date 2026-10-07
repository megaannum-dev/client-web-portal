"use client";

import { useState, type MouseEvent } from "react";
import { Download, Loader2 } from "@/lib/icons";

/** 34px icon button; `danger` turns it error-coloured on hover.
 *  If `onClick` returns a promise (downloads), the icon spins until it settles. */
export function AsyncIconButton({
  icon: Icon, title, onClick, danger, round,
}: {
  /** 36px circle that fills primary on hover (Client Correspondents row actions). */
  round?: boolean;
  icon: typeof Download;
  title: string;
  onClick: () => void | Promise<unknown>;
  danger?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const stop = (e: MouseEvent) => {
    e.stopPropagation();
    const r = onClick();
    if (r instanceof Promise) {
      setBusy(true);
      void r.finally(() => setBusy(false));
    }
  };
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-busy={busy}
      disabled={busy}
      onClick={stop}
      className={`inline-flex flex-none items-center justify-center border border-outline-variant bg-surface-lowest text-secondary transition-all duration-150 ${round ? "h-9 w-9 rounded-full hover:border-primary hover:bg-primary hover:text-white" : `h-[34px] w-[34px] rounded hover:bg-surface-container ${danger ? "hover:border-error hover:text-error" : "hover:text-on-surface"}`} ${busy ? "cursor-progress" : "cursor-pointer"}`}
    >
      {busy ? <Loader2 size={round ? 18 : 16} strokeWidth={2} className="animate-spin" /> : <Icon size={round ? 18 : 16} strokeWidth={2} />}
    </button>
  );
}
