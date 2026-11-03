"use client";

import { useTranslation } from "react-i18next";
import { X, Maximize2, Minimize2 } from "@/lib/icons";

export const PANEL_ICON_BUTTON =
  "inline-flex items-center justify-center size-8 rounded-full border-none cursor-pointer bg-surface-container text-secondary hover:text-on-surface transition-colors duration-150";

/**
 * Header chrome for FloatingPanel contents (FAQ, help assistant): avatar,
 * title + caption, then any extra actions, maximize/restore and close —
 * matching the Advisory Room's header.
 */
export function PanelHeader({
  avatar,
  title,
  subtitle,
  actions,
  maximized,
  onToggleMaximize,
  onClose,
  closeLabel,
}: {
  avatar: React.ReactNode;
  title: string;
  subtitle: string;
  /** Extra buttons placed before maximize/close. */
  actions?: React.ReactNode;
  maximized: boolean;
  onToggleMaximize: () => void;
  onClose: () => void;
  closeLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 py-3.5 px-6 border-b border-outline-variant shrink-0">
      {avatar}
      <div className="min-w-0">
        <h2 className="m-0 text-base leading-tight font-bold text-on-surface truncate">{title}</h2>
        <p className="mt-[3px] mb-0 text-xs text-secondary truncate">{subtitle}</p>
      </div>
      <div className="ml-auto flex items-center gap-2 shrink-0">
        {actions}
        <button
          type="button"
          onClick={onToggleMaximize}
          aria-label={t(maximized ? "messaging.restore" : "messaging.maximize")}
          className={PANEL_ICON_BUTTON}
        >
          {maximized ? <Minimize2 size={16} strokeWidth={1.75} /> : <Maximize2 size={16} strokeWidth={1.75} />}
        </button>
        <button type="button" onClick={onClose} aria-label={closeLabel} className={PANEL_ICON_BUTTON}>
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
