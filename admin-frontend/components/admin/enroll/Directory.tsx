"use client";

/* ============================================================
   Enroll User — internal-user directory
   Ported from admin/admin-app/ProtoEnroll.jsx (PDirectory/PUserRow).
   FE-9 follow-up: renders StaffOut rows (was the AdminUser mock shape).
   ============================================================ */
import Link from "next/link";
import { useRef } from "react";
import {
  History, KeyRound, MoreVertical, Pencil, RotateCcw, Search,
  SlidersHorizontal, UserRound, UserRoundPlus, Ban,
} from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  DropdownMenu, FilterChip, Help, IconButton, Row, Td, TextField, Th, UserCell,
  type MenuItemDef,
} from "@/components/admin/Shared";
import { useAdminStore } from "@/lib/admin/AdminStoreContext";
import { STATUS_LABEL, initialsFor, seenFor, toneFor, type StaffOut } from "@/lib/admin/types";

export interface DirectoryProps {
  filter: string;
  onFilterChange: (f: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
  kebab: string | null;
  onKebabChange: (uid: string | null) => void;
  onAudit: () => void;
  onEnroll: () => void;
  onEdit: (u: StaffOut) => void;
  onReset: (u: StaffOut) => void;
  onManageOverrides: (u: StaffOut) => void;
  onDeactivate: (u: StaffOut) => void;
  onReactivate: (u: StaffOut) => void;
}

export function Directory({
  filter, onFilterChange, query, onQueryChange, kebab, onKebabChange,
  onAudit, onEnroll, onEdit, onReset, onManageOverrides, onDeactivate, onReactivate,
}: DirectoryProps) {
  const store = useAdminStore();
  const users = store.staff;
  const counts = {
    All: users.length,
    [STATUS_LABEL.ACTIVE]: users.filter((u) => u.status === "ACTIVE").length,
    [STATUS_LABEL.INITIATED]: users.filter((u) => u.status === "INITIATED").length,
    [STATUS_LABEL.DEACTIVATED]: users.filter((u) => u.status === "DEACTIVATED").length,
  };
  const q = query.trim().toLowerCase();
  const shown = users.filter((u) => {
    const passFilter = filter === "All" ? true : STATUS_LABEL[u.status] === filter;
    const passQ = !q || [u.name ?? "", u.email ?? "", u.role].join(" ").toLowerCase().includes(q);
    return passFilter && passQ;
  });

  return (
    <>
      <PageHeader
        title="Enroll User"
        subtitle={`${counts.All} internal users · ${counts[STATUS_LABEL.INITIATED]} initiated, not yet signed in · ${counts[STATUS_LABEL.DEACTIVATED]} deactivated`}
        actions={
          <>
            <Link href="/admin/system-config?view=overrides">
              <Button variant="secondary" icon={UserRound}>Overrides ({store.overrides.length})</Button>
            </Link>
            <Button variant="secondary" icon={History} onClick={onAudit}>Audit log</Button>
            <Button icon={UserRoundPlus} onClick={onEnroll}>Enroll user</Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2.5">
        {Object.entries(counts).map(([label, n]) => (
          <FilterChip key={label} label={label} n={n} on={label === filter} onClick={() => onFilterChange(label)} />
        ))}
        <span className="ml-auto w-[260px]">
          <TextField value={query} onChange={onQueryChange} placeholder="Search name, email, role…" icon={Search} />
        </span>
      </div>

      <Card pad={false}>
        <table className="w-full border-collapse">
          <thead className="bg-surface-low">
            <tr>
              <Th>User</Th><Th>Role</Th><Th>Status</Th><Th>Overrides</Th><Th>Last seen</Th><Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <UserRow
                key={u.firebase_uid}
                u={u}
                menuOpen={kebab === u.firebase_uid}
                onToggleMenu={() => onKebabChange(kebab === u.firebase_uid ? null : u.firebase_uid)}
                onCloseMenu={() => onKebabChange(null)}
                onEdit={onEdit}
                onReset={onReset}
                onManageOverrides={onManageOverrides}
                onDeactivate={onDeactivate}
                onReactivate={onReactivate}
              />
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="border-t border-outline-variant px-4 py-[38px] text-center text-[13px] text-secondary">
                  No users match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      <Help className="mt-3">
        The row menu carries the whole lifecycle — reissue credentials, manage that person&apos;s exceptions, or deactivate. Deactivation is reversible: overrides are held, not revoked.
      </Help>
    </>
  );
}

function UserRow({
  u, menuOpen, onToggleMenu, onCloseMenu, onEdit, onReset, onManageOverrides, onDeactivate, onReactivate,
}: {
  u: StaffOut;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onEdit: (u: StaffOut) => void;
  onReset: (u: StaffOut) => void;
  onManageOverrides: (u: StaffOut) => void;
  onDeactivate: (u: StaffOut) => void;
  onReactivate: (u: StaffOut) => void;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const off = u.status === "DEACTIVATED";
  const items: MenuItemDef[] = off
    ? [["Edit profile & role", Pencil], ["Manage overrides", SlidersHorizontal], "-", ["Reactivate account", RotateCcw]]
    : [["Edit profile & role", Pencil], ["Send set-password link", KeyRound], ["Manage overrides", SlidersHorizontal], "-", ["Deactivate account", Ban, true]];
  const pick = (label: string) => {
    onCloseMenu();
    if (label === "Edit profile & role") onEdit(u);
    else if (label === "Send set-password link") onReset(u);
    else if (label === "Manage overrides") onManageOverrides(u);
    else if (label === "Deactivate account") onDeactivate(u);
    else if (label === "Reactivate account") onReactivate(u);
  };
  return (
    <Row dim={off}>
      <Td><UserCell initials={initialsFor(u.name)} name={u.name} sub={u.email} /></Td>
      <Td><Chip tone="warm" dot={false}>{u.role}</Chip></Td>
      <Td><Chip tone={toneFor(u.status)}>{STATUS_LABEL[u.status]}</Chip></Td>
      <Td>
        {u.override_count ? (
          <button
            type="button"
            onClick={() => onManageOverrides(u)}
            className="cursor-pointer border-none bg-transparent p-0 font-sans text-[12.5px] font-semibold text-primary underline underline-offset-[3px]"
          >
            {u.override_count} active
          </button>
        ) : (
          <span className="text-[12.5px] text-secondary">—</span>
        )}
      </Td>
      <Td className="whitespace-nowrap text-[12.5px] text-secondary">{seenFor(u.last_sign_in_at)}</Td>
      <Td className="text-right">
        <span ref={anchorRef} className="inline-flex items-center gap-2">
          <IconButton icon={MoreVertical} onClick={onToggleMenu} />
          {menuOpen && <DropdownMenu items={items} onClose={onCloseMenu} onPick={pick} anchorRef={anchorRef} />}
        </span>
      </Td>
    </Row>
  );
}
