/* ============================================================
   Admin console — role/page catalog
   Ported verbatim (values + order) from admin/admin-app/AdminData.jsx
   so the ported screens match the design handoff.
   ============================================================ */
import type { FlatPage, Level, PageGroup, RoleDef } from "@/lib/admin/types";

export const ROLES: RoleDef[] = [
  { code: "RM", name: "Relationship Manager" },
  { code: "MOBO", name: "Middle / Back Office" },
  { code: "PM", name: "Portfolio Manager" },
  { code: "PC", name: "Portfolio Controller" },
  { code: "COMPLIANCE", name: "Compliance Officer" },
  { code: "ADMIN", name: "Administrator" },
];

export const ROLE_IDX: Record<string, number> = {
  RM: 0, MOBO: 1, PM: 2, PC: 3, COMPLIANCE: 4, ADMIN: 5,
};

export const LEVEL_LABEL: Record<Level, string> = { none: "None", view: "View", edit: "Edit" };

export const PAGE_CATALOG: PageGroup[] = [
  ["Relationship Mgmt", [
    { name: "Dashboard", path: "/rm/dashboard", levels: ["edit", "none", "view", "none", "view", "edit"] },
    { name: "Onboarding & Renewal", path: "/rm/onboarding", levels: ["edit", "view", "none", "none", "view", "edit"] },
    { name: "Model Subscription", path: "/rm/subscription", levels: ["edit", "view", "view", "view", "view", "edit"] },
    { name: "Monthly Reports", path: "/rm/reports", levels: ["view", "view", "view", "view", "view", "edit"] },
  ]],
  ["Middle / Back Office", [
    { name: "Dashboard", path: "/mobo/dashboard", levels: ["none", "edit", "none", "view", "view", "edit"] },
    { name: "Trade Reconciliation", path: "/mobo/reconciliation", levels: ["none", "edit", "view", "view", "view", "edit"] },
    { name: "Post-Trade Allocation", path: "/mobo/allocation", levels: ["none", "edit", "view", "edit", "view", "edit"] },
    { name: "Daily Exception Report", path: "/mobo/exceptions", levels: ["none", "edit", "none", "view", "view", "edit"] },
  ]],
  ["Portfolio Control", [
    { name: "Model Management", path: "/pc/models", levels: ["view", "view", "edit", "edit", "view", "edit"] },
    { name: "Allocation Matrix", path: "/pc/matrix", levels: ["none", "view", "edit", "edit", "view", "edit"] },
    { name: "Investment Guideline", path: "/pc/guidelines", levels: ["view", "none", "edit", "edit", "edit", "edit"] },
    { name: "Allotment & Redemption", path: "/pc/allotment", levels: ["view", "view", "view", "edit", "view", "edit"] },
  ]],
  ["Compliance", [
    { name: "Compliance Overview", path: "/compliance/overview", levels: ["none", "none", "none", "view", "edit", "edit"] },
    { name: "Guideline Review", path: "/compliance/guidelines", levels: ["none", "none", "view", "view", "edit", "edit"] },
    { name: "Redemption Review", path: "/compliance/redemptions", levels: ["none", "none", "none", "view", "edit", "edit"] },
  ]],
  ["Administration", [
    { name: "Enroll User", path: "/admin/enroll-user", levels: ["none", "none", "none", "none", "none", "edit"] },
    { name: "System Config", path: "/admin/system-config", levels: ["none", "none", "none", "none", "none", "edit"] },
  ]],
];

export const ALL_PAGES: FlatPage[] = PAGE_CATALOG.flatMap(([group, pages]) =>
  pages.map((p) => ({ group, name: p.name, path: p.path })),
);

export const PAGE_BY_PATH: Record<string, FlatPage> = Object.fromEntries(
  ALL_PAGES.map((p) => [p.path, p]),
);

export const TOTAL_PAGES = ALL_PAGES.length;

export const kFor = (path: string, roleIdx: number) => `${path}|${roleIdx}`;

/** Seed standing levels — `path|roleIdx` -> Level, read straight off PAGE_CATALOG. */
export function seedLevels(): Record<string, Level> {
  const m: Record<string, Level> = {};
  PAGE_CATALOG.forEach(([, pages]) => {
    pages.forEach((p) => {
      p.levels.forEach((lv, i) => { m[kFor(p.path, i)] = lv; });
    });
  });
  return m;
}
