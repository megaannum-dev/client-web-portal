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

export const LEVEL_LABEL: Record<Level, string> = { NONE: "None", VIEW: "View", EDIT: "Edit" };

export const PAGE_CATALOG: PageGroup[] = [
  ["Relationship Mgmt", [
    { name: "Dashboard", path: "/rm/dashboard", levels: ["EDIT", "NONE", "VIEW", "NONE", "VIEW", "EDIT"] },
    { name: "Onboarding & Renewal", path: "/rm/onboarding", levels: ["EDIT", "VIEW", "NONE", "NONE", "VIEW", "EDIT"] },
    { name: "Model Subscription", path: "/rm/subscription", levels: ["EDIT", "VIEW", "VIEW", "VIEW", "VIEW", "EDIT"] },
    { name: "Monthly Reports", path: "/rm/reports", levels: ["VIEW", "VIEW", "VIEW", "VIEW", "VIEW", "EDIT"] },
  ]],
  ["Middle / Back Office", [
    { name: "Dashboard", path: "/mobo/dashboard", levels: ["NONE", "EDIT", "NONE", "VIEW", "VIEW", "EDIT"] },
    { name: "Trade Reconciliation", path: "/mobo/reconciliation", levels: ["NONE", "EDIT", "VIEW", "VIEW", "VIEW", "EDIT"] },
    { name: "Post-Trade Allocation", path: "/mobo/allocation", levels: ["NONE", "EDIT", "VIEW", "EDIT", "VIEW", "EDIT"] },
    { name: "Daily Exception Report", path: "/mobo/exceptions", levels: ["NONE", "EDIT", "NONE", "VIEW", "VIEW", "EDIT"] },
  ]],
  ["Portfolio Control", [
    { name: "Model Management", path: "/pc/models", levels: ["VIEW", "VIEW", "EDIT", "EDIT", "VIEW", "EDIT"] },
    { name: "Allocation Matrix", path: "/pc/matrix", levels: ["NONE", "VIEW", "EDIT", "EDIT", "VIEW", "EDIT"] },
    { name: "Investment Guideline", path: "/pc/guidelines", levels: ["VIEW", "NONE", "EDIT", "EDIT", "EDIT", "EDIT"] },
    { name: "Allotment & Redemption", path: "/pc/allotment", levels: ["VIEW", "VIEW", "VIEW", "EDIT", "VIEW", "EDIT"] },
  ]],
  ["Compliance", [
    { name: "Compliance Overview", path: "/compliance/overview", levels: ["NONE", "NONE", "NONE", "VIEW", "EDIT", "EDIT"] },
    { name: "Guideline Review", path: "/compliance/guidelines", levels: ["NONE", "NONE", "VIEW", "VIEW", "EDIT", "EDIT"] },
    { name: "Redemption Review", path: "/compliance/redemptions", levels: ["NONE", "NONE", "NONE", "VIEW", "EDIT", "EDIT"] },
  ]],
  ["Administration", [
    { name: "Enroll User", path: "/admin/enroll-user", levels: ["NONE", "NONE", "NONE", "NONE", "NONE", "EDIT"] },
    { name: "System Config", path: "/admin/system-config", levels: ["NONE", "NONE", "NONE", "NONE", "NONE", "EDIT"] },
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
