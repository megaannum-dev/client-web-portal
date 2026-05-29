"use client";

import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "@/lib/icons";

export function EyeToggle({
  censored,
  onToggle,
}: {
  censored: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const Icon = censored ? Eye : EyeOff;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={censored ? t("common.reveal_values") : t("common.hide_values")}
      className="p-1.5 rounded-full text-secondary hover:bg-surface-container hover:text-on-surface transition-colors duration-150 shrink-0"
    >
      <Icon size={16} strokeWidth={1.75} />
    </button>
  );
}
