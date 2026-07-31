/* ============================================================
   Admin console — role/page catalog
   Derived from lib/pages-config.ts's PAGES registry — the real route
   guard is the single source of truth for which pages exist (FE-2 /
   proposal 019 A-1). No fictional paths, no positional role index.

   The old hand-written per-page-per-role levels[] policy (17 fictional
   pages, six-slot arrays keyed by array position) is NOT discarded —
   it is promoted into the DB layer's page_access seed (D-11) before
   deletion here. No frontend code reads a levels[] literal at runtime,
   before or after: the store's levels come from GET
   /api/admin/access/matrix once that lands (FE-9).
   ============================================================ */
import { PAGES, type PageId, type Role } from "@/lib/pages-config";
import type { Level } from "@/lib/admin/types";

/** One page as the console renders it. `path` is display-only. */
export interface CatalogPage { page_id: PageId; label: string; path: string; group: string }

const OTHER_GROUP = "Other";

/** Flat, in `PAGES` order (hand-ordered already). */
export const ALL_PAGES: CatalogPage[] = (Object.keys(PAGES) as PageId[]).map((page_id) => {
  const p = PAGES[page_id];
  return { page_id, label: p.label, path: p.path, group: p.subgroup ?? OTHER_GROUP };
});

/** Grouped page catalog, DERIVED from PAGES. Group = the page's `subgroup`, or "Other"
 *  for the two hideFromNav pages that carry none (mobo.recon-overview,
 *  compliance.overview). Group order follows first appearance in PAGES. */
export const PAGE_GROUPS: Array<[group: string, pages: CatalogPage[]]> = (() => {
  const order: string[] = [];
  const byGroup = new Map<string, CatalogPage[]>();
  for (const p of ALL_PAGES) {
    if (!byGroup.has(p.group)) {
      byGroup.set(p.group, []);
      order.push(p.group);
    }
    byGroup.get(p.group)!.push(p);
  }
  return order.map((g): [string, CatalogPage[]] => [g, byGroup.get(g)!]);
})();

export const PAGE_BY_ID: Record<PageId, CatalogPage> = Object.fromEntries(
  ALL_PAGES.map((p) => [p.page_id, p]),
) as Record<PageId, CatalogPage>;

export const TOTAL_PAGES = ALL_PAGES.length; // === Object.keys(PAGES).length

/** Matrix / staging cell key, keyed by role CODE. */
export const kFor = (pageId: PageId, role: Role): string => `${pageId}|${role}`;

/** Fallback role order, used only until the first MatrixOut read resolves so the rails
 *  render. Display names and user counts come from MatrixOut.roles, never from here. */
export const ROLE_CODES: readonly Role[] = ["RM", "MOBO", "PM", "PC", "COMPLIANCE", "ADMIN"];

export const LEVEL_LABEL: Record<Level, string> = { NONE: "None", VIEW: "View", EDIT: "Edit" };

/** Shared expiry choices for an override — the wizard's Access step (FE-14) and
 *  the override modals (currently enroll/LifecycleModals.tsx) read one list from here. */
export const EXPIRY_OPTS = ["30 days", "90 days", "30 Sep 2026", "31 Dec 2026", "No expiry"];
