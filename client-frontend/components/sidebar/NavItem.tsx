"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface NavItemProps {
  href: string;
  icon: LucideIcon;
  label: string;
  active?: boolean;
  isOpen: boolean;
}

export function NavItem({ href, icon: Icon, label, active = false, isOpen }: NavItemProps) {
  return (
    <Link
      href={href}
      title={label}
      className={[
        "flex items-center transition-colors duration-150 rounded",
        "gap-3 py-3 pl-4 pr-5 w-full",
        active
          ? "bg-primary text-white"
          : "text-secondary hover:bg-surface-container hover:text-on-surface",
      ].join(" ")}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={18} strokeWidth={1.75} className="shrink-0" />
      {
        <span className="text-label-md font-semibold tracking-[0.05em] uppercase">
          {label}
        </span>
      }
    </Link>
  );
}
