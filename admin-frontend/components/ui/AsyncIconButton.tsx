"use client";

import { useState, type MouseEvent } from "react";
import { Download, Loader2 } from "@/lib/icons";

/** 34px icon button; `danger` turns it error-coloured on hover.
 *  If `onClick` returns a promise (downloads), the icon spins until it settles. */
export function AsyncIconButton({
  icon: Icon, title, onClick, danger,
}: {
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
      className={`inline-flex h-[34px] w-[34px] flex-none items-center justify-center rounded border border-outline-variant bg-surface-lowest text-secondary transition-all duration-150 hover:bg-surface-container ${busy ? "cursor-progress" : "cursor-pointer"} ${danger ? "hover:border-error hover:text-error" : "hover:text-on-surface"}`}
    >
      {busy ? <Loader2 size={16} strokeWidth={2} className="animate-spin" /> : <Icon size={16} strokeWidth={2} />}
    </button>
  );
}
