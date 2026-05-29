"use client";

import { useTranslation } from "react-i18next";
import { PanelLeftClose, PanelLeftOpen, Building2 } from "@/lib/icons";
import { useSidebarOpen } from "./SidebarContext";
import Image from "next/image";

interface SidebarLogoProps {
  onToggle: () => void;
}

export function SidebarLogo({ onToggle }: SidebarLogoProps) {
  const isOpen = useSidebarOpen();
  const { t }  = useTranslation();

  return (
    <div
      className={[
        "flex items-center py-5 w-full shrink-0",
        isOpen ? "gap-3 pl-3 pr-5" : "justify-center px-2",
      ].join(" ")}
    >
      {/* Logo mark + wordmark — hidden when collapsed */}
      {isOpen && (
        <>
          {/* <div className="bg-primary rounded p-1 shrink-0">
            <Building2 size={25} strokeWidth={2} stroke="white" />
          </div> */}
          <Image src="/favicon.png" alt="MegaCrm" width={36} height={36} className="shrink-0"/>
          <div className="flex flex-col min-w-0">
            <span className="text-headline-md font-bold text-on-surface whitespace-nowrap leading-tight">
              {/* {t("sidebar.brand_name")} */}
              MegaCRM
            </span>
            <span className="text-body-sm text-secondary whitespace-nowrap leading-tight">
              {t("sidebar.brand_subtitle")}
            </span>
          </div>
        </>
      )}

      {/* Toggle button — always visible; icon flips with state */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={isOpen ? t("nav.collapse_sidebar") : t("nav.expand_sidebar")}
        className={[
          "shrink-0 p-1.5 rounded text-secondary",
          "hover:bg-surface-container hover:text-on-surface transition-colors duration-150",
          isOpen ? "ml-auto" : "",
        ].join(" ")}
      >
        {isOpen
          ? <PanelLeftClose size={20} strokeWidth={1.75} />
          : <PanelLeftOpen  size={20} strokeWidth={1.75} />
        }
      </button>
    </div>
  );
}
