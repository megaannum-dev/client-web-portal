"use client";

import { PanelLeftClose, PanelLeftOpen } from "@/lib/icons";
import Image from "next/image";

interface SidebarLogoProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function SidebarLogo({ isOpen, onToggle }: SidebarLogoProps) {
  return (
    <div
      className={[
        "flex items-center py-5 w-full shrink-0",
        isOpen ? "gap-3 pl-3 pr-5" : "justify-center px-2",
      ].join(" ")}
    >
      {isOpen && (
        <>
          <Image src="/favicon.png" alt="Megaanuum" width={36} height={36} className="shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-headline-md font-bold text-on-surface whitespace-nowrap leading-tight">
              CRM
            </span>
            <span className="text-body-sm text-secondary whitespace-nowrap leading-tight">
              Internal Admins Portal
            </span>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onToggle}
        aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
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
