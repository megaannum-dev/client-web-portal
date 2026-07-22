"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronUp } from "@/lib/icons";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

export type RoleSubPage = { label: string; href: string; icon: LucideIcon; subgroup?: string };
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

function groupBySubgroup(pages: RoleSubPage[]) {
  const groups: { name: string; pages: RoleSubPage[] }[] = [];
  const idx = new Map<string, number>();
  for (const p of pages) {
    const sg = p.subgroup ?? "";
    const i = idx.get(sg);
    if (i !== undefined) groups[i].pages.push(p);
    else { idx.set(sg, groups.length); groups.push({ name: sg, pages: [p] }); }
  }
  return groups;
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
  const [collapsedSubs, setCollapsedSubs] = useState<Set<string>>(new Set());

  // Auto-expand when navigating into a child page.
  useEffect(() => {
    if (childActive) setExpanded(true);
  }, [childActive]);

  // Auto-expand subgroup containing the active page.
  useEffect(() => {
    const active = group.pages.find((p) => isActive(pathname, p.href));
    if (active?.subgroup && collapsedSubs.has(active.subgroup)) {
      setCollapsedSubs((prev) => {
        const next = new Set(prev);
        next.delete(active.subgroup!);
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleSub = (name: string) =>
    setCollapsedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });

  const subgroups = groupBySubgroup(group.pages);
  const hasSubgroups = subgroups.some((sg) => sg.name);

  // Compute maxHeight based on visible content for smooth animation
  const visiblePageCount = hasSubgroups
    ? subgroups.reduce((n, sg) => n + (collapsedSubs.has(sg.name) ? 0 : sg.pages.length), 0)
    : group.pages.length;
  const subgroupHeaderCount = hasSubgroups ? subgroups.filter((sg) => sg.name).length : 0;

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

  // Three visual states for the parent row:
  //  filled — home page active, OR group collapsed over an active child
  //  linear — group expanded AND a child page is active
  //  rest   — everything else
  const filled = homeActive || (childActive && !expanded);
  const linear = !homeActive && childActive && expanded;

  const renderPage = (p: RoleSubPage) => {
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
  };

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
          maxHeight: expanded ? visiblePageCount * 44 + subgroupHeaderCount * 32 + 8 : 0,
          opacity: expanded ? 1 : 0,
        }}
      >
        <div className="mt-1 flex flex-col gap-0.5 pl-3.5">
          {hasSubgroups
            ? subgroups.map((sg, i) => (
                <div key={sg.name || "__none__"}>
                  {sg.name && (
                    <button
                      type="button"
                      onClick={() => toggleSub(sg.name)}
                      className={clsx(
                        "flex w-full items-center gap-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-secondary",
                        i === 0 ? "pt-1" : "pt-3",
                      )}
                    >
                      <ChevronDown
                        size={10}
                        strokeWidth={2.5}
                        className={clsx(
                          "shrink-0 transition-transform duration-150",
                          collapsedSubs.has(sg.name) && "-rotate-90",
                        )}
                      />
                      <span>{sg.name}</span>
                    </button>
                  )}
                  {!collapsedSubs.has(sg.name) && sg.pages.map(renderPage)}
                </div>
              ))
            : group.pages.map(renderPage)}
        </div>
      </div>
    </div>
  );
}
