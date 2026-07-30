"use client";

/* ============================================================
   Admin console — shared store
   Backs both Enroll User and System Config (mounted once by
   app/(roles)/admin/layout.tsx, which Next.js keeps alive while
   navigating between the two sibling routes — so state here
   behaves like the single-SPA store the design prototype used:
   users, overrides, the permission matrix + staged edits, and the
   audit log all survive a page switch).

   Page-local UI state (the enroll wizard's draft, which view/step
   is showing, the config page's selected role, open modal, etc.)
   is NOT here — it lives in each page and resets on navigation,
   same as clicking to a different route always would.
   ============================================================ */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { ALL_PAGES, LEVEL_LABEL, PAGE_BY_ID, TOTAL_PAGES, kFor } from "@/lib/admin/catalog";
import { ADMIN_AUDIT, ADMIN_OVERRIDES, ADMIN_USERS, TODAY } from "@/lib/mock/admin-data";
import type { AdminUser, AuditEntry, Level, Override, Role, StagedChange, UserStatus } from "@/lib/admin/types";
import type { PageId } from "@/lib/pages-config";

let uid = 0;
const nextId = () => `x${++uid}`;

const STATUS_TONE: Record<UserStatus, AdminUser["tone"]> = {
  Active: "active", Initiated: "pending", Deactivated: "neutral",
};

interface AdminStore {
  users: AdminUser[];
  overrides: Override[];
  staged: Record<string, StagedChange>;
  stagedList: StagedChange[];
  published: { when: string; by: string };
  audit: AuditEntry[];
  totalPages: number;

  log: (what: string, detail: string) => void;

  /** Effective (staged-aware) level for a page × role cell. */
  eff: (pageId: PageId, role: Role) => Level;
  grantedFor: (role: Role) => number;
  roleUsers: (code: Role) => number;
  ovrFor: (name: string) => Override[];
  ovrOn: (pageId: PageId, role: Role) => boolean;

  stage: (pageId: PageId, role: Role, to: Level) => void;
  publish: (note?: string) => void;
  discard: () => void;
  copyRole: (fromCode: Role, toCode: Role) => void;
  resetRole: (code: Role) => void;

  addOverride: (o: Omit<Override, "id" | "by" | "soon"> & { soon?: boolean }) => void;
  revokeOverride: (id: string) => void;

  addUser: (u: AdminUser) => void;
  updateUser: (email: string, patch: Partial<AdminUser>) => void;
  setStatus: (email: string, status: UserStatus) => void;
}

const AdminStoreCtx = createContext<AdminStore | null>(null);

export function AdminStoreProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<AdminUser[]>(() => ADMIN_USERS.map((u) => ({ ...u })));
  const [overrides, setOverrides] = useState<Override[]>(() => ADMIN_OVERRIDES.map((o) => ({ ...o })));
  // ponytail: standing levels start empty (all NONE) — the old seed-from-catalog
  // helper read a now-deleted hand-written table. Real seed values arrive over GET
  // /api/admin/access/matrix once the store is wired to the backend (FE-9).
  const [levels, setLevels] = useState<Record<string, Level>>({});
  const [staged, setStaged] = useState<Record<string, StagedChange>>({});
  const [published, setPublished] = useState({ when: "12 Jul 2026", by: "Omar Bakri" });
  const [audit, setAudit] = useState<AuditEntry[]>(ADMIN_AUDIT);

  const log = useCallback((what: string, detail: string) => {
    setAudit((a) => [{ id: nextId(), ts: `${TODAY} · 10:24`, who: "Omar Bakri", what, detail }, ...a]);
  }, []);

  const stagedList = useMemo(() => Object.values(staged), [staged]);

  const eff = useCallback(
    (pageId: PageId, role: Role): Level => {
      const k = kFor(pageId, role);
      return staged[k] ? staged[k].to : (levels[k] ?? "NONE");
    },
    [staged, levels],
  );

  const grantedFor = useCallback(
    (role: Role) => ALL_PAGES.filter((p) => eff(p.page_id, role) !== "NONE").length,
    [eff],
  );

  const roleUsers = useCallback(
    (code: Role) => users.filter((u) => u.role === code && u.status !== "Deactivated").length,
    [users],
  );

  const ovrFor = useCallback((name: string) => overrides.filter((o) => o.name === name), [overrides]);

  const ovrOn = useCallback(
    (pageId: PageId, role: Role) => overrides.some((o) => o.path === PAGE_BY_ID[pageId].path && o.role === role),
    [overrides],
  );

  const stage = useCallback(
    (pageId: PageId, role: Role, to: Level) => {
      const k = kFor(pageId, role);
      setStaged((s) => {
        const next = { ...s };
        if (levels[k] === to) delete next[k];
        else next[k] = { page_id: pageId, label: PAGE_BY_ID[pageId].label, role, from: levels[k] ?? "NONE", to };
        return next;
      });
    },
    [levels],
  );

  const publish = useCallback(
    (note?: string) => {
      const list = Object.values(staged);
      const n = list.length;
      if (!n) return;
      setLevels((l) => {
        const next = { ...l };
        list.forEach((s) => { next[kFor(s.page_id, s.role)] = s.to; });
        return next;
      });
      setStaged({});
      setPublished({ when: TODAY, by: "Omar Bakri" });
      log(
        `Published ${n} access change${n === 1 ? "" : "s"}`,
        note || list.map((s) => `${s.label} · ${s.role} ${LEVEL_LABEL[s.from]} → ${LEVEL_LABEL[s.to]}`).join("; "),
      );
    },
    [staged, log],
  );

  const discard = useCallback(() => setStaged({}), []);

  const copyRole = useCallback(
    (fromCode: Role, toCode: Role) => {
      ALL_PAGES.forEach((p) => stage(p.page_id, toCode, eff(p.page_id, fromCode)));
    },
    [stage, eff],
  );

  const resetRole = useCallback((code: Role) => {
    setStaged((s) => {
      const next = { ...s };
      Object.keys(next).forEach((k) => { if (next[k].role === code) delete next[k]; });
      return next;
    });
  }, []);

  const addOverride = useCallback<AdminStore["addOverride"]>(
    (o) => {
      setOverrides((l) => [...l, { ...o, id: nextId(), by: "Omar Bakri", soon: o.soon ?? false }]);
      log("Override granted", `${o.name} · ${o.page} · ${LEVEL_LABEL[o.from]} → ${LEVEL_LABEL[o.to]} · expires ${o.exp}`);
    },
    [log],
  );

  const revokeOverride = useCallback(
    (id: string) => {
      setOverrides((l) => {
        const o = l.find((x) => x.id === id);
        if (o) log("Override revoked", `${o.name} · ${o.page} · back to role default`);
        return l.filter((x) => x.id !== id);
      });
    },
    [log],
  );

  const addUser = useCallback((u: AdminUser) => setUsers((l) => [...l, u]), []);

  const updateUser = useCallback(
    (email: string, patch: Partial<AdminUser>) =>
      setUsers((l) => l.map((u) => (u.email === email ? { ...u, ...patch } : u))),
    [],
  );

  const setStatus = useCallback(
    (email: string, status: UserStatus) =>
      setUsers((l) => l.map((u) => (u.email === email ? { ...u, status, tone: STATUS_TONE[status] } : u))),
    [],
  );

  const value: AdminStore = {
    users, overrides, staged, stagedList, published, audit, totalPages: TOTAL_PAGES,
    log, eff, grantedFor, roleUsers, ovrFor, ovrOn,
    stage, publish, discard, copyRole, resetRole,
    addOverride, revokeOverride, addUser, updateUser, setStatus,
  };

  return <AdminStoreCtx.Provider value={value}>{children}</AdminStoreCtx.Provider>;
}

export function useAdminStore(): AdminStore {
  const ctx = useContext(AdminStoreCtx);
  if (!ctx) throw new Error("useAdminStore must be used within AdminStoreProvider");
  return ctx;
}
