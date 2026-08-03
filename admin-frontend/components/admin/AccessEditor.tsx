"use client";

/* ============================================================
   Admin console — shared page-group access editor (PAccess)
   Used by both the Enroll wizard's "Access review" step and
   System Config's role-first view. Collapsible per-workspace
   groups; each page row is a LevelSeg the caller wires up.
   ============================================================ */
import { ChevronDown, ChevronRight, TriangleAlert } from "@/lib/icons";
import { Chip } from "@/components/ui/Chip";
import { PAGE_GROUPS } from "@/lib/admin/catalog";
import { LevelSeg } from "@/components/admin/Shared";
import type { Level } from "@/lib/admin/types";
import type { PageId } from "@/lib/pages-config";

export function AccessEditor({
  valueFor, defaultFor, onSet, openGroups, onToggleGroup, stagedOn, disabledFor,
}: {
  valueFor: (pageId: PageId) => Level;
  /** When provided, a value differing from the default renders as an override. */
  defaultFor?: ((pageId: PageId) => Level) | null;
  onSet: (pageId: PageId, level: Level) => void;
  openGroups: string[];
  onToggleGroup: (group: string) => void;
  stagedOn?: (pageId: PageId) => boolean;
  /** Pages the caller has locked to their current level — rendered read-only. */
  disabledFor?: (pageId: PageId) => boolean;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {PAGE_GROUPS.map(([group, pages]) => {
        const granted = pages.filter((p) => valueFor(p.page_id) !== "NONE").length;
        const open = openGroups.includes(group);
        const changed = stagedOn ? pages.filter((p) => stagedOn(p.page_id)).length : 0;
        return (
          <div
            key={group}
            className="overflow-hidden rounded-xl bg-white"
            style={{ border: `1px solid ${changed ? "var(--primary)" : "var(--outline-variant)"}` }}
          >
            <div
              onClick={() => onToggleGroup(group)}
              className="flex cursor-pointer items-center gap-2.5 px-[15px] py-3"
              style={{ background: open ? "var(--surface-low)" : "#fff" }}
            >
              {open ? <ChevronDown size={15} strokeWidth={2} className="text-secondary" /> : <ChevronRight size={15} strokeWidth={2} className="text-secondary" />}
              <span className="text-[13.5px] font-bold text-on-surface">{group}</span>
              {changed > 0 && <Chip tone="warm">{changed} changed</Chip>}
              <span className="ml-auto text-[12px] font-semibold text-secondary">{granted} of {pages.length}</span>
            </div>
            {open && pages.map((p) => {
              const v = valueFor(p.page_id);
              const isOvr = defaultFor ? defaultFor(p.page_id) !== v : false;
              return (
                <div
                  key={p.page_id}
                  className="flex items-center gap-3 px-[15px] py-[11px]"
                  style={{ borderTop: "1px solid var(--outline-variant)", background: isOvr ? "rgba(242,116,5,0.04)" : "#fff" }}
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-on-surface">{p.label}</div>
                    <div className="text-[11.5px] text-secondary">{p.path}</div>
                  </div>
                  <span className="flex-1" />
                  {isOvr && (
                    <span
                      className="inline-flex items-center gap-[5px] rounded-full px-[9px] py-[3px] text-[11px] font-bold uppercase tracking-[0.05em]"
                      style={{ color: "var(--primary)", background: "rgba(242,116,5,0.1)" }}
                    >
                      <TriangleAlert size={11} strokeWidth={2.5} />override
                    </span>
                  )}
                  <LevelSeg value={v} override={isOvr} onChange={disabledFor?.(p.page_id) ? undefined : (lv) => onSet(p.page_id, lv)} />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
