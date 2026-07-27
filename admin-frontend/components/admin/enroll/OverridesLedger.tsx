"use client";

/* ============================================================
   Enroll User — per-user overrides ledger
   Ported from admin/admin-app/ProtoConfig.jsx (POverridesLedger).
   Reached only from the Enroll User directory's "Overrides (N)"
   button; its back button returns there.
   ============================================================ */
import { ArrowLeft, Plus, X } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Help, Label, LevelDiff, Row, Td, Th, UserCell } from "@/components/admin/Shared";
import { useAdminStore } from "@/lib/admin/AdminStoreContext";

export interface OverridesLedgerProps {
  onBack: () => void;
  onAddOverride: () => void;
}

export function OverridesLedger({ onBack, onAddOverride }: OverridesLedgerProps) {
  const store = useAdminStore();
  const overrides = store.overrides;
  const soon = overrides.filter((o) => o.soon).length;
  const stats: [string, number, boolean][] = [
    ["Active overrides", overrides.length, false],
    ["Expiring in 30 days", soon, soon > 0],
    ["Users affected", new Set(overrides.map((o) => o.name)).size, false],
    ["Roles affected", new Set(overrides.map((o) => o.role)).size, false],
  ];

  return (
    <>
      <PageHeader
        title="Overrides"
        subtitle="Per-user exceptions to the role defaults."
        actions={
          <>
            <Button variant="secondary" icon={ArrowLeft} onClick={onBack}>Back to directory</Button>
            <Button icon={Plus} onClick={onAddOverride}>Add override</Button>
          </>
        }
      />

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
                <Td><UserCell initials={o.initials} name={o.name} sub={o.role} /></Td>
                <Td>
                  <div className="text-[13px] font-semibold">{o.page}</div>
                  <div className="text-[11.5px] text-secondary">{o.path}</div>
                </Td>
                <Td><LevelDiff from={o.from} to={o.to} override /></Td>
                <Td className="max-w-[230px] text-[12.5px] text-secondary">{o.why}</Td>
                <Td className="text-[12.5px] text-secondary">{o.by}</Td>
                <Td className="whitespace-nowrap text-[12.5px]">
                  <span style={{ color: o.soon ? "var(--primary)" : "var(--secondary)", fontWeight: o.soon ? 700 : 400 }}>{o.exp}</span>
                </Td>
                <Td className="text-right">
                  <Button variant="secondary" icon={X} onClick={() => store.revokeOverride(o.id)}>Revoke</Button>
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
