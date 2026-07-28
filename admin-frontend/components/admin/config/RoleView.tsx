"use client";

/* ============================================================
   System Config — role-first view (PRoleView in the handoff).
   Left rail picks a role, right panel reuses the shared
   AccessEditor (PAccess) wired to the staged-aware store.
   ============================================================ */
import { useState } from "react";
import { toast } from "sonner";
import { AccessEditor } from "@/components/admin/AccessEditor";
import { Help, Label, DropdownMenu, type MenuItemDef } from "@/components/admin/Shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Copy, RefreshCw, Users } from "@/lib/icons";
import { ROLES, ROLE_IDX, kFor } from "@/lib/admin/catalog";
import { useAdminStore } from "@/lib/admin/AdminStoreContext";
import type { Role } from "@/lib/admin/types";

export function RoleView({
  role, onSelectRole, openGroups, onToggleGroup,
}: {
  role: Role;
  onSelectRole: (code: Role) => void;
  openGroups: string[];
  onToggleGroup: (group: string) => void;
}) {
  const { eff, stage, staged, stagedList, grantedFor, roleUsers, totalPages, copyRole, resetRole } = useAdminStore();
  const [copyOpen, setCopyOpen] = useState(false);
  const idx = ROLE_IDX[role];
  const roleName = ROLES.find((r) => r.code === role)?.name ?? "";

  return (
    <div className="flex items-stretch gap-5" style={{ height: 660 }}>
      <Card pad={false} className="flex w-[250px] flex-none flex-col overflow-auto">
        <div className="px-4 pb-[7px] pt-[13px]"><Label>Roles</Label></div>
        {ROLES.map((r) => {
          const on = r.code === role;
          const changed = stagedList.filter((s) => s.role === ROLE_IDX[r.code]).length;
          return (
            <div
              key={r.code}
              onClick={() => onSelectRole(r.code)}
              className="flex cursor-pointer items-center gap-2.5 px-4 py-[11px] transition-colors"
              style={{ background: on ? "var(--primary-fixed)" : "transparent", borderLeft: `3px solid ${on ? "var(--primary)" : "transparent"}` }}
            >
              <div className="min-w-0">
                <div className="text-[13px] font-bold" style={{ color: on ? "var(--primary)" : "var(--on-surface)" }}>{r.code}</div>
                <div className="text-[11.5px] text-secondary">{r.name}</div>
              </div>
              <span className="ml-auto flex items-center gap-1.5">
                {changed > 0 && <span className="h-[7px] w-[7px] rounded-full bg-primary" />}
                <span className="text-[12px] font-bold text-secondary">{grantedFor(ROLE_IDX[r.code])}</span>
              </span>
            </div>
          );
        })}
      </Card>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
        <div className="flex flex-shrink-0 items-start justify-between gap-4 px-5 pb-4 pt-[18px]">
          <div>
            <h3 className="text-[20px] font-bold text-on-surface">{roleName} · {role}</h3>
            <Help className="mt-1">{roleUsers(role)} users hold this role · {grantedFor(idx)} of {totalPages} pages reachable</Help>
          </div>
          <span className="relative flex gap-2.5">
            <Button variant="secondary" icon={Copy} onClick={() => setCopyOpen((v) => !v)}>Copy from role</Button>
            <Button
              variant="secondary"
              icon={RefreshCw}
              onClick={() => {
                resetRole(role);
                toast(`${role} reverted to its published access.`);
              }}
            >
              Reset to default
            </Button>
            {copyOpen && (
              <DropdownMenu
                width={210}
                className="left-0 top-10"
                items={ROLES.filter((r) => r.code !== role).map((r) => [`${r.code} — ${r.name}`, Users] as MenuItemDef)}
                onClose={() => setCopyOpen(false)}
                onPick={(label) => {
                  setCopyOpen(false);
                  const fromCode = label.split(" — ")[0] as Role;
                  copyRole(fromCode, role);
                  toast(`Access copied from ${fromCode} into ${role} — staged, not published.`);
                }}
              />
            )}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 pb-[18px]">
          <AccessEditor
            valueFor={(path) => eff(path, idx)}
            defaultFor={null}
            onSet={(path, lv) => stage(path, idx, lv)}
            openGroups={openGroups}
            onToggleGroup={onToggleGroup}
            stagedOn={(path) => !!staged[kFor(path, idx)]}
          />
          <Help className="mt-3">Each workspace collapses — open only the group you are changing. Staged edits carry over when you switch back to the matrix.</Help>
        </div>
      </section>
    </div>
  );
}
