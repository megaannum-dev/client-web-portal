"use client";

/* ============================================================
   System Config — pages × roles matrix (PMatrix/PCell/PLevelKey
   in the design handoff). Body grouped by workspace, one column
   per role; ADMIN × Administration is locked — it's the only
   route back into the permission model, so it can't edit itself
   out of it.
   ============================================================ */
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Lock } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Help, Label, LevelBadge, Th, Td, useHover } from "@/components/admin/Shared";
import { LEVEL_LABEL, PAGE_GROUPS, ROLE_CODES, type CatalogPage, kFor } from "@/lib/admin/catalog";
import { useAdminStore } from "@/lib/admin/AdminStoreContext";
import type { Level } from "@/lib/admin/types";
import type { PageId, Role } from "@/lib/pages-config";

export interface CellPayload { page_id: PageId; label: string; path: string; role: Role }

const LOCKED_MSG = "ADMIN × Administration is locked — it is the only route back into the permission model.";

/** ADMIN × the admin pages stays locked — it is the only route back into the permission
 *  model. Re-expressed against the surviving keys: the old test compared the group
 *  label and a positional role index, and neither survives derivation from PAGES. */
const isLocked = (page_id: PageId, role: Role) => role === "ADMIN" && page_id.startsWith("admin.");

export function Matrix({
  collapsed, onToggleGroup, selCell, onSelectCell, onOpenCell,
}: {
  collapsed: Record<string, boolean>;
  onToggleGroup: (group: string) => void;
  selCell: string | null;
  onSelectCell: (key: string | null) => void;
  onOpenCell: (payload: CellPayload) => void;
}) {
  const { roleUsers } = useAdminStore();

  return (
    <>
      <Card pad={false}>
        <table className="w-full border-collapse">
          <thead className="bg-surface-low">
            <tr>
              <Th className="w-[300px]">
                Page
                <span className="mt-0.5 block text-[11px] font-normal normal-case tracking-normal text-secondary">route</span>
              </Th>
              {ROLE_CODES.map((role) => (
                <Th key={role} className="!text-center">
                  {role}
                  <span className="mt-0.5 block text-[11px] font-normal normal-case tracking-normal text-secondary">
                    {roleUsers(role)} user{roleUsers(role) === 1 ? "" : "s"}
                  </span>
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PAGE_GROUPS.map(([group, pages]) => {
              const open = !collapsed[group];
              return (
                <Group
                  key={group}
                  group={group}
                  pages={pages}
                  open={open}
                  onToggleGroup={onToggleGroup}
                  selCell={selCell}
                  onSelectCell={onSelectCell}
                  onOpenCell={onOpenCell}
                />
              );
            })}
          </tbody>
        </table>
      </Card>
      <LevelKey />
      <Help className="mt-2.5">
        Click any cell to set its level. ADMIN × Administration is locked — it is the only route back into the permission model.
      </Help>
    </>
  );
}

function Group({
  group, pages, open, onToggleGroup, selCell, onSelectCell, onOpenCell,
}: {
  group: string;
  pages: CatalogPage[];
  open: boolean;
  onToggleGroup: (group: string) => void;
  selCell: string | null;
  onSelectCell: (key: string | null) => void;
  onOpenCell: (payload: CellPayload) => void;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={1 + ROLE_CODES.length}
          onClick={() => onToggleGroup(group)}
          className="cursor-pointer border-t border-outline-variant bg-surface-container px-4 py-[9px]"
        >
          <span className="flex items-center gap-2">
            <Label>{group}</Label>
            <span className="text-[11px] text-secondary">{pages.length} pages</span>
            <span className="ml-auto flex text-secondary">
              {open ? <ChevronUp size={15} strokeWidth={2} /> : <ChevronDown size={15} strokeWidth={2} />}
            </span>
          </span>
        </td>
      </tr>
      {open && pages.map((p) => (
        <tr key={p.page_id}>
          <Td>
            <div className="text-[13px] font-semibold">{p.label}</div>
            <div className="text-[11.5px] text-secondary">{p.path}</div>
          </Td>
          {ROLE_CODES.map((role) => (
            <Cell
              key={role}
              page_id={p.page_id}
              label={p.label}
              path={p.path}
              role={role}
              selCell={selCell}
              onSelectCell={onSelectCell}
              onOpenCell={onOpenCell}
            />
          ))}
        </tr>
      ))}
    </>
  );
}

function Cell({
  page_id, label, path, role, selCell, onSelectCell, onOpenCell,
}: {
  page_id: PageId;
  label: string;
  path: string;
  role: Role;
  selCell: string | null;
  onSelectCell: (key: string | null) => void;
  onOpenCell: (payload: CellPayload) => void;
}) {
  const { eff, ovrOn, staged } = useAdminStore();
  const [hover, hb] = useHover();
  const key = kFor(page_id, role);
  const st = staged[key];
  const sel = selCell === key;
  const locked = isLocked(page_id, role);
  const isOvr = ovrOn(page_id, role);

  const click = () => {
    if (locked) {
      toast.warning(LOCKED_MSG);
      return;
    }
    onSelectCell(key);
    onOpenCell({ page_id, label, path, role });
  };

  return (
    <td
      {...hb}
      onClick={click}
      className="relative border-t border-outline-variant px-4 py-[13px] text-center transition-colors"
      style={{
        cursor: locked ? "not-allowed" : "pointer",
        background: sel ? "rgba(242,116,5,0.07)" : st ? "rgba(242,116,5,0.05)" : hover && !locked ? "var(--surface-low)" : undefined,
        boxShadow: sel ? "inset 0 0 0 1.5px var(--primary)" : "none",
      }}
    >
      <span className="relative inline-flex">
        <LevelBadge level={eff(page_id, role)} override={isOvr} />
        {st && (
          <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full border-[1.5px] border-white" style={{ background: "var(--primary)" }} />
        )}
        {locked && (
          <span className="absolute -bottom-1 -right-1.5 flex rounded-full bg-white p-px">
            <Lock size={11} strokeWidth={2.5} className="text-secondary" />
          </span>
        )}
      </span>
    </td>
  );
}

function LevelKey() {
  const rows: [Level, string][] = [
    ["NONE", "page hidden from nav, route blocked"],
    ["VIEW", "read-only — no writes or actions"],
    ["EDIT", "full use of the page’s actions"],
  ];
  return (
    <div className="mt-4 flex flex-wrap gap-[22px]">
      {rows.map(([lv, txt]) => (
        <span key={lv} className="inline-flex items-center gap-2.5">
          <LevelBadge level={lv} size={24} />
          <span className="text-[12px] text-secondary">
            <b className="text-on-surface">{LEVEL_LABEL[lv]}</b> — {txt}
          </span>
        </span>
      ))}
      <span className="inline-flex items-center gap-2.5">
        <LevelBadge level="VIEW" override size={24} />
        <span className="text-[12px] text-secondary">per-user override</span>
      </span>
    </div>
  );
}
