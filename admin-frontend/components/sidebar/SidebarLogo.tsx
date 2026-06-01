"use client";

import { useTranslation } from "react-i18next";
import { PanelLeftClose, PanelLeftOpen } from "@/lib/icons";
import Image from "next/image";

interface SidebarLogoProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function SidebarLogo({ isOpen, onToggle }: SidebarLogoProps) {
  const { t } = useTranslation();

  return (
    <div
      className={[
        "flex items-center py-5 w-full shrink-0", "gap-3 pl-3 pr-5"
      ].join(" ")}
    >
      {/* Logo mark + wordmark — hidden when collapsed */}
      
      <Image src="/favicon.png" alt="MegaCrm" width={36} height={36} className="shrink-0" />
      <div className="flex flex-col min-w-0">
        <span className="text-headline-md font-bold text-on-surface whitespace-nowrap leading-tight">
          MegaPortal
        </span>
        <span className="text-body-sm text-secondary whitespace-nowrap leading-tight">
          {t("sidebar.brand_subtitle")}
        </span>
      </div>
        

      {/* Toggle button — always visible; icon flips with state */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={t("nav.collapse_sidebar")}
        className={[
          "shrink-0 p-1.5 rounded text-secondary",
          "hover:bg-surface-container hover:text-on-surface transition-colors duration-150",
          isOpen ? "ml-auto" : "",
        ].join(" ")}
      >
        <PanelLeftClose size={20} strokeWidth={1.75} />
      </button>
    </div>
  );
}
