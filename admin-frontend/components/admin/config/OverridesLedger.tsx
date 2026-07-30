"use client";

/* ============================================================
   System Config — per-user overrides ledger (third view, FE-13)
   Moved from enroll/OverridesLedger.tsx. System Config's own
   PageHeader now covers the header and the "Add override" action
   (rendered only on this view) — this component owns just the
   stat cards and the table.

   Migrated off the mock AdminUser/Override shape onto the real
   OverrideOut DTO (FE-8/FE-9): page -> page_label, path -> page_path,
   role -> user_role, name -> user_name, initials -> initialsFor(user_name),
   soon -> expiring_soon, why -> reason, by -> granted_by,
   exp -> expiryLabel(expires_at), from/to -> role_default/level.
   ============================================================ */
import { X } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Help, Label, LevelDiff, Row, Td, Th, UserCell } from "@/components/admin/Shared";
import { useAdminStore } from "@/lib/admin/AdminStoreContext";
import { initialsFor } from "@/lib/admin/types";
import { todayLabel } from "@/lib/admin/today";

/** An `expires_at` ISO instant (or null) -> the ledger's short display format.
 *  ponytail: mirrors enroll/LifecycleModals.tsx's local expiryLabel — lib/admin/today.ts
 *  is out of this unit's file scope, so the formatter stays duplicated here too. */
function expiryLabel(iso: string | null): string {
  if (!iso) return "No expiry";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : todayLabel(d);
}

export function OverridesLedger() {
  const { overrides, revokeOverride } = useAdminStore();
  const soon = overrides.filter((o) => o.expiring_soon).length;
  const stats: [string, number, boolean][] = [
    ["Active overrides", overrides.length, false],
    ["Expiring in 30 days", soon, soon > 0],
    ["Users affected", new Set(overrides.map((o) => o.firebase_uid)).size, false],
    ["Roles affected", new Set(overrides.map((o) => o.user_role)).size, false],
  ];

  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        {stats.map(([label, val, warn]) => (
          <Card key={label} style={warn ? { borderColor: "var(--primary)" } : undefined}>
            <div className="flex items-center gap-[7px]">
              {warn && <span className="h-[7px] w-[7px] rounded-full" style={{ background: "var(--primary)" }} />}
              <Label>{label}</Label>
            </div>
            <div className="mt-1.5 text-[28px] font-bold tracking-[-0.02em]">{val}</div>
          </Card>
        ))}
      </div>

      <Card pad={false}>
        <table className="w-full border-collapse">
          <thead className="bg-surface-low">
            <tr>
              <Th>User</Th><Th>Page</Th><Th>Default → granted</Th><Th>Reason</Th><Th>Granted by</Th><Th>Expires</Th><Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {overrides.map((o) => (
              <Row key={o.id}>
                <Td><UserCell initials={initialsFor(o.user_name)} name={o.user_name} sub={o.user_role} /></Td>
                <Td>
                  <div className="text-[13px] font-semibold">{o.page_label}</div>
                  <div className="text-[11.5px] text-secondary">{o.page_path}</div>
                </Td>
                <Td><LevelDiff from={o.role_default} to={o.level} override /></Td>
                <Td className="max-w-[230px] text-[12.5px] text-secondary">{o.reason}</Td>
                <Td className="text-[12.5px] text-secondary">{o.granted_by}</Td>
                <Td className="whitespace-nowrap text-[12.5px]">
                  <span style={{ color: o.expiring_soon ? "var(--primary)" : "var(--secondary)", fontWeight: o.expiring_soon ? 700 : 400 }}>
                    {expiryLabel(o.expires_at)}
                  </span>
                </Td>
                <Td className="text-right">
                  <Button variant="secondary" icon={X} onClick={() => revokeOverride(o.id)}>Revoke</Button>
                </Td>
              </Row>
            ))}
            {overrides.length === 0 && (
              <tr>
                <td colSpan={7} className="border-t border-outline-variant px-4 py-[38px] text-center text-[13px] text-secondary">
                  No active overrides — every user is on their role default.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      <Help className="mt-3">
        Every override carries a reason and an expiry — exceptions decay by default. Deactivating a user <b>holds</b> their overrides rather than revoking them.
      </Help>
    </>
  );
}
