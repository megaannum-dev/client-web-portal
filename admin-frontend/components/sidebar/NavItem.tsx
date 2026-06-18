"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface NavItemProps {
  href: string;
  icon: LucideIcon;
  label: string;
  active?: boolean;
  isOpen: boolean;
  /**
   * Render the SHARED_PAGES idiom from the design (Shell.jsx `NavItem`):
   * compact 11px/14px padding, 13px/semibold/0.03em label (non-uppercase),
   * matching the role-group rows it sits beside. Footer items keep the
   * original treatment by leaving this off.
   */
  compact?: boolean;
}

export function NavItem({
  href,
  icon: Icon,
  label,
  active = false,
  isOpen,
  compact = false,
}: NavItemProps) {
  return (
    <Link
      href={href}
      title={label}
      className={[
        "flex items-center transition-colors duration-150 rounded w-full",
        isOpen
          ? compact
            ? "gap-3 px-3.5 py-[11px]"
            : "gap-3 py-3 pl-4 pr-5"
          : "justify-center py-3",
        active
          ? "bg-primary text-white"
          : "text-secondary hover:bg-surface-container hover:text-on-surface",
      ].join(" ")}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={18} strokeWidth={1.75} className="shrink-0" />
      {isOpen && (
        <span
          className={
            compact
              ? "text-[13px] font-semibold tracking-[0.03em]"
              : "text-label-md font-semibold tracking-[0.05em] uppercase"
          }
        >
          {label}
        </span>
      )}
    </Link>
  );
}
