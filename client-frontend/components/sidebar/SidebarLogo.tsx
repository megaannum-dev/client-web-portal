import Image from "next/image";
import { PanelLeftClose } from "@/lib/icons";

interface SidebarLogoProps {
  onToggle: () => void;
}

export function SidebarLogo({ onToggle }: SidebarLogoProps) {
  return (
    <div className="flex items-center gap-3 pl-3 pr-5 py-5 w-full">
      {/* Collapse button sits first — keeps it near the left edge */}
      <Image src="/favicon.png" alt="MegaCRM" width={36} height={36} className="shrink-0" />
      <div className="flex flex-col">
        <span className="text-headline-md font-bold text-on-surface whitespace-nowrap leading-tight">
          MegaCRM
        </span>
        <span className="text-body-sm text-secondary whitespace-nowrap leading-tight">
          Client Portal
        </span>
      </div>

      <button
        type="button"
        onClick={onToggle}
        aria-label="Collapse sidebar"
        className="shrink-0 p-1.5 rounded ml-auto text-secondary hover:bg-surface-container hover:text-on-surface transition-colors duration-150"
      >
        <PanelLeftClose size={20} strokeWidth={1.75} />
      </button>
    </div>
  );
}
