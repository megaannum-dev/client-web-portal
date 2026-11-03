"use client";

import { useTranslation } from "react-i18next";
import { X } from "@/lib/icons";
import { PANEL_ICON_BUTTON } from "@/components/ui/PanelHeader";
import { initials } from "./initials";

/** Shown briefly while the client is handed from the help assistant to their RM. */
export function RmConnecting({ rmName, onClose }: { rmName: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="relative h-full flex flex-col items-center justify-center gap-4 px-6 bg-surface-lowest text-center">
      <button
        type="button"
        onClick={onClose}
        aria-label={t("messaging.close")}
        className={`absolute top-3.5 right-6 ${PANEL_ICON_BUTTON}`}
      >
        <X size={16} strokeWidth={1.75} />
      </button>

      {/* RM avatar with a pulsing ring while connecting */}
      <span className="relative inline-flex">
        <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping motion-reduce:animate-none" />
        <span className="relative size-16 rounded-full inline-flex items-center justify-center bg-primary text-primary-foreground text-xl font-bold">
          {initials(rmName)}
        </span>
      </span>

      <div className="flex flex-col gap-1">
        <p className="m-0 text-base font-bold text-on-surface">{rmName ?? t("messaging.assistant.your_team")}</p>
        <p className="m-0 text-xs text-secondary">{t("messaging.role.rm")}</p>
      </div>
      <p className="m-0 text-body-sm text-secondary" role="status">
        {t("messaging.assistant.connecting")}
      </p>
    </div>
  );
}
