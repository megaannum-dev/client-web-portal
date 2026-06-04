"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronUp } from "@/lib/icons";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

export type RoleSubPage = { label: string; href: string; icon: LucideIcon };
export type RoleGroupConfig = {
  label: string;
  icon: LucideIcon;
  /** The role dashboard — clicking the parent navigates here. */
  home: string;
  pages: RoleSubPage[];
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface RoleGroupProps {
  group: RoleGroupConfig;
  isOpen: boolean;
}

export function RoleGroup({ group, isOpen }: RoleGroupProps) {
  const pathname = usePathname();
  const childActive = group.pages.some((p) => isActive(pathname, p.href));
  const homeActive = isActive(pathname, group.home);
  const [expanded, setExpanded] = useState(true);

  // Auto-expand when navigating into a child page.
  useEffect(() => {
    if (childActive) setExpanded(true);
  }, [childActive]);

  const ParentIcon = group.icon;

  /* Collapsed sidebar → flat icon-only buttons (parent + children). */
  if (!isOpen) {
    return (
      <div className="flex flex-col gap-1">
        <Link
          href={group.home}
          title={group.label}
          className={clsx(
            "flex items-center justify-center rounded py-3 transition-colors duration-150",
            homeActive
              ? "bg-primary text-white"
              : "text-secondary hover:bg-surface-container hover:text-on-surface",
          )}
        >
          <ParentIcon size={18} strokeWidth={1.75} className="shrink-0" />
        </Link>
        {group.pages.map((p) => {
          const active = isActive(pathname, p.href);
          const Icon = p.icon;
          return (
            <Link
              key={p.href}
              href={p.href}
              title={p.label}
              className={clsx(
                "flex items-center justify-center rounded py-3 transition-colors duration-150",
                active
                  ? "bg-primary-fixed text-primary"
                  : "text-secondary hover:bg-surface-container hover:text-on-surface",
              )}
            >
              <Icon size={16} strokeWidth={1.75} className="shrink-0" />
            </Link>
          );
        })}
      </div>
    );
  }

  // Three visual states for the parent row (mirrors design-system "Nav item states"):
  //  filled — home page active, OR group collapsed over an active child (option 1)
  //  linear — group expanded AND a child page is active
  //  rest   — everything else
  const filled = homeActive || (childActive && !expanded);
  const linear = !homeActive && childActive && expanded;

  return (
    <div>
      {/* Parent row — label navigates to the dashboard; chevron toggles the sub-nav */}
      <div
        className={clsx(
          "flex w-full items-center gap-3 rounded border px-3.5 py-[11px] transition-colors duration-150",
          "text-[13px] tracking-[0.03em]",
          filled
            ? "border-transparent bg-primary text-white font-bold hover:bg-[#dd6a05]"
            : linear
              ? "border-primary bg-white text-primary font-bold hover:bg-surface-low"
              : "border-transparent bg-transparent text-secondary font-semibold hover:bg-surface-container hover:text-on-surface",
        )}
      >
        <Link href={group.home} className="flex flex-1 items-center gap-3 min-w-0">
          <ParentIcon size={18} strokeWidth={1.75} className="shrink-0" />
          <span className="truncate">{group.label}</span>
        </Link>
        <button
          type="button"
          aria-label={expanded ? "Collapse" : "Expand"}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className={clsx(
            "ml-auto flex shrink-0 rounded p-0.5",
            filled ? "text-white" : linear ? "text-primary" : "text-secondary",
          )}
        >
          {expanded
            ? <ChevronUp size={16} strokeWidth={2} />
            : <ChevronDown size={16} strokeWidth={2} />}
        </button>
      </div>

      {/* Sub-nav */}
      <div
        className="overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out"
        style={{
          maxHeight: expanded ? group.pages.length * 44 + 8 : 0,
          opacity: expanded ? 1 : 0,
        }}
      >
        <div className="mt-1 flex flex-col gap-0.5 pl-3.5">
          {group.pages.map((p) => {
            const active = isActive(pathname, p.href);
            const Icon = p.icon;
            return (
              <Link
                key={p.href}
                href={p.href}
                className={clsx(
                  "flex w-full items-center gap-2.5 rounded px-3.5 py-2.5 text-left text-[13px] transition-colors duration-150",
                  active
                    ? "bg-primary-fixed font-semibold text-primary"
                    : "font-medium text-secondary hover:bg-surface-container hover:text-on-surface",
                )}
              >
                <Icon size={16} strokeWidth={1.75} className="shrink-0" />
                <span>{p.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
