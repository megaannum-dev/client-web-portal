"use client";

/* ============================================================
   Admin console — shared store
   Backs both Enroll User and System Config (mounted once by
   app/(roles)/admin/layout.tsx, which Next.js keeps alive while
   navigating between the two sibling routes — so state here
   behaves like the single-SPA store the design prototype used:
   staff, overrides, the permission matrix + staged edits, and the
   audit log all survive a page switch).

   FE-9: API-backed. The server component (layout.tsx) fetches the
   initial world once (getStaff/getMatrix/getOverrides/getAudit) and
   hands it down as initial* props; this store never fetches on
   mount. Every mutator is `await action(...)` -> patch local state
   on success -> `toast.error(result.error)` on failure. Staging
   (staged/stage/discard/copyRole/resetRole) stays purely local (D-5)
   — unchanged behavior from the mock, just re-keyed to page_id/role.

   Page-local UI state (the enroll wizard's draft, which view/step
   is showing, the config page's selected role, open modal, etc.)
   is NOT here — it lives in each page and resets on navigation,
   same as clicking to a different route always would.
   ============================================================ */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  getStaff, enrollStaff, updateStaff as updateStaffAction, sendSetPasswordLink,
  getMatrix, publishMatrix, grantOverride, revokeOverride as revokeOverrideAction, getAudit,
} from "@/app/(roles)/admin/actions";
import { ALL_PAGES, PAGE_BY_ID, ROLE_CODES, kFor } from "@/lib/admin/catalog";
import type { AuditOut, Level, MatrixOut, OverrideOut, PageId, Role, StaffOut, StagedChange } from "@/lib/admin/types";
import type { OverrideIn, StaffCreatedOut, StaffEnrollIn, StaffUpdateIn } from "@/server/admin";

/** `publish()`'s result — success carries the fresh `published` stamp; a 409 means
 *  someone else published first (the matrix has been re-read, `staged` is intact). */
export type PublishResult =
  | { ok: true; published: { at: string; by: string } | null }
  | { ok: false; conflict: true }
  | { ok: false; conflict: false; error: string };

function levelsToMap(levels: MatrixOut["levels"]): Record<string, Level> {
  const map: Record<string, Level> = {};
  levels.forEach((l) => { map[kFor(l.page_id, l.role)] = l.level; });
  return map;
}

/** ADMIN must always retain Edit on the two pages that manage access itself —
 *  otherwise an admin can lock themselves (and everyone else) out for good. */
export const LOCKED_ADMIN_PAGES: PageId[] = ["admin.enroll-user", "admin.system-config"];
export const isLockedForAdmin = (pageId: PageId, role: Role) => role === "ADMIN" && LOCKED_ADMIN_PAGES.includes(pageId);

interface AdminStore {
  /* ---- server state ---- */
  staff: StaffOut[];
  overrides: OverrideOut[];
  audit: AuditOut[];
  /** MatrixOut.pages / .roles, as received — never re-sorted or re-labelled. */
  pages: MatrixOut["pages"];
  roles: MatrixOut["roles"];
  published: { at: string; by: string } | null;
  totalPages: number;
  loadError: string | null;

  /* ---- staging: purely local (D-5) ---- */
  staged: Record<string, StagedChange>;
  stagedList: StagedChange[];
  stage: (pageId: PageId, role: Role, to: Level) => void;
  discard: () => void;
  copyRole: (from: Role, to: Role) => void;
  resetRole: (role: Role) => void;

  /* ---- derived reads ---- */
  eff: (pageId: PageId, role: Role) => Level;
  grantedFor: (role: Role) => number;
  roleUsers: (role: Role) => number;
  ovrFor: (firebaseUid: string) => OverrideOut[];
  ovrOn: (pageId: PageId, role: Role) => boolean;

  /* ---- mutators: await the action, patch local state on success, toast on failure ---- */
  publish: (note?: string) => Promise<PublishResult>;
  addOverride: (body: OverrideIn) => Promise<boolean>;
  revokeOverride: (id: string) => Promise<boolean>;
  enroll: (body: StaffEnrollIn) => Promise<StaffCreatedOut | null>;
  updateStaff: (uid: string, body: StaffUpdateIn) => Promise<boolean>;
  sendLink: (uid: string) => Promise<boolean>;
  refreshStaff: () => Promise<void>;
  refreshMatrix: () => Promise<void>;
}

const AdminStoreCtx = createContext<AdminStore | null>(null);

export interface AdminStoreProviderProps {
  children: ReactNode;
  initialStaff: StaffOut[];
  initialMatrix: MatrixOut | null;
  initialOverrides: OverrideOut[];
  initialAudit: AuditOut[];
  loadError: string | null;
}

export function AdminStoreProvider({
  children, initialStaff, initialMatrix, initialOverrides, initialAudit, loadError,
}: AdminStoreProviderProps) {
  const [staff, setStaff] = useState<StaffOut[]>(initialStaff);
  const [overrides, setOverrides] = useState<OverrideOut[]>(initialOverrides);
  const [audit, setAudit] = useState<AuditOut[]>(initialAudit);
  const [pages, setPages] = useState<MatrixOut["pages"]>(initialMatrix?.pages ?? ALL_PAGES);
  const [roles, setRoles] = useState<MatrixOut["roles"]>(
    initialMatrix?.roles ?? ROLE_CODES.map((code) => ({ code, name: code, user_count: 0 })),
  );
  const [levels, setLevels] = useState<Record<string, Level>>(() => levelsToMap(initialMatrix?.levels ?? []));
  const [published, setPublished] = useState<{ at: string; by: string } | null>(initialMatrix?.published ?? null);
  const [staged, setStaged] = useState<Record<string, StagedChange>>({});

  // A failed initial load surfaces once, here — the pages render their own empty states.
  useEffect(() => {
    if (loadError) toast.error(loadError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    (role: Role) => pages.filter((p) => eff(p.page_id, role) !== "NONE").length,
    [pages, eff],
  );

  const roleUsers = useCallback((role: Role) => roles.find((r) => r.code === role)?.user_count ?? 0, [roles]);

  const ovrFor = useCallback(
    (firebaseUid: string) => overrides.filter((o) => o.firebase_uid === firebaseUid),
    [overrides],
  );

  const ovrOn = useCallback(
    (pageId: PageId, role: Role) => overrides.some((o) => o.page_id === pageId && o.user_role === role),
    [overrides],
  );

  const stage = useCallback(
    (pageId: PageId, role: Role, to: Level) => {
      const target = isLockedForAdmin(pageId, role) ? "EDIT" : to;
      const k = kFor(pageId, role);
      setStaged((s) => {
        const next = { ...s };
        // No-op-drop rule: staging a cell back to its current published level (or to NONE
        // when the cell is simply absent from `levels`, which is implicitly NONE) removes
        // it from `staged` instead of recording a change — publish() only ever sends real
        // diffs. Fixtures that stage a cell must give it a starting level that differs.
        if ((levels[k] ?? "NONE") === target) delete next[k];
        else next[k] = { page_id: pageId, label: PAGE_BY_ID[pageId].label, role, from: levels[k] ?? "NONE", to: target };
        return next;
      });
    },
    [levels],
  );

  const discard = useCallback(() => setStaged({}), []);

  const copyRole = useCallback(
    (from: Role, to: Role) => {
      pages.forEach((p) => stage(p.page_id, to, eff(p.page_id, from)));
    },
    [pages, stage, eff],
  );

  const resetRole = useCallback((role: Role) => {
    setStaged((s) => {
      const next = { ...s };
      Object.keys(next).forEach((k) => { if (next[k].role === role) delete next[k]; });
      return next;
    });
  }, []);

  const refreshStaff = useCallback(async () => {
    const result = await getStaff();
    if (result.success) setStaff(result.data);
    else toast.error(result.error);
  }, []);

  const refreshMatrix = useCallback(async () => {
    const result = await getMatrix();
    if (result.success) {
      setPages(result.data.pages);
      setRoles(result.data.roles);
      setLevels(levelsToMap(result.data.levels));
      setPublished(result.data.published);
    } else {
      toast.error(result.error);
    }
  }, []);

  const refreshAudit = useCallback(async () => {
    const result = await getAudit({ limit: 50 });
    if (result.success) setAudit(result.data);
    else toast.error(result.error);
  }, []);

  const publish = useCallback(
    async (note?: string): Promise<PublishResult> => {
      const list = Object.values(staged);
      if (!list.length) return { ok: true, published };
      const result = await publishMatrix({
        changes: list.map((s) => ({ page_id: s.page_id, role: s.role, level: s.to })),
        note: note?.trim() || null,
        base_published_at: published?.at ?? null,
      });
      if (result.success) {
        setPages(result.data.pages);
        setRoles(result.data.roles);
        setLevels(levelsToMap(result.data.levels));
        setPublished(result.data.published);
        setStaged({});
        await refreshAudit();
        return { ok: true, published: result.data.published };
      }
      if (result.code === "HTTP_409" || result.code === "matrix_changed_since_read") {
        await refreshMatrix();
        return { ok: false, conflict: true };
      }
      toast.error(result.error);
      return { ok: false, conflict: false, error: result.error };
    },
    [staged, published, refreshAudit, refreshMatrix],
  );

  const addOverride = useCallback(async (body: OverrideIn): Promise<boolean> => {
    const result = await grantOverride(body);
    if (result.success) {
      setOverrides((l) => [...l, result.data]);
      return true;
    }
    toast.error(result.error);
    return false;
  }, []);

  const revokeOverride = useCallback(async (id: string): Promise<boolean> => {
    const result = await revokeOverrideAction(id);
    if (result.success) {
      setOverrides((l) => l.filter((o) => o.id !== id));
      return true;
    }
    toast.error(result.error);
    return false;
  }, []);

  const enroll = useCallback(async (body: StaffEnrollIn): Promise<StaffCreatedOut | null> => {
    const result = await enrollStaff(body);
    if (result.success) {
      const created = result.data;
      setStaff((l) => [
        ...l,
        {
          firebase_uid: created.firebase_uid, email: created.email,
          name: `${body.first_name} ${body.last_name}`.trim(), role: created.role,
          department: body.department ?? null, phone_number: body.phone_number ?? null,
          status: created.status, last_sign_in_at: null, override_count: created.override_count,
          client_count: null, open_ticket_count: null,
        },
      ]);
      return created;
    }
    toast.error(result.error);
    return null;
  }, []);

  const updateStaff = useCallback(async (uid: string, body: StaffUpdateIn): Promise<boolean> => {
    const result = await updateStaffAction(uid, body);
    if (result.success) {
      const updated = result.data;
      setStaff((l) => l.map((u) => (u.firebase_uid === uid ? updated : u)));
      return true;
    }
    toast.error(result.error);
    return false;
  }, []);

  const sendLink = useCallback(async (uid: string): Promise<boolean> => {
    const result = await sendSetPasswordLink(uid);
    if (result.success) return result.data.link_sent;
    toast.error(result.error);
    return false;
  }, []);

  const value: AdminStore = {
    staff, overrides, audit, pages, roles, published, totalPages: pages.length, loadError,
    staged, stagedList, stage, discard, copyRole, resetRole,
    eff, grantedFor, roleUsers, ovrFor, ovrOn,
    publish, addOverride, revokeOverride, enroll, updateStaff, sendLink, refreshStaff, refreshMatrix,
  };

  return <AdminStoreCtx.Provider value={value}>{children}</AdminStoreCtx.Provider>;
}

export function useAdminStore(): AdminStore {
  const ctx = useContext(AdminStoreCtx);
  if (!ctx) throw new Error("useAdminStore must be used within AdminStoreProvider");
  return ctx;
}
