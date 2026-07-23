"use client";

// Redemptions table — shows Status; there is NO inline action (approve/reject
// live only in the detail panel). Emergent rows are highlighted; > US$300K rows
// carry a shield marker.

import { TriangleAlert, Shield } from "@/lib/icons";
import { Chip } from "@/components/ui/Chip";
import { Card } from "@/components/ui/Card";
import { fmtMoney } from "@/lib/pc/format";
import type { AllotRdmpStatus, RedemptionView } from "@/lib/onboarding/types";

export function RedeemStatusChip({ status }: { status: AllotRdmpStatus }) {
  if (status === "awaiting_pc") return <Chip tone="pending">Awaiting approval</Chip>;
  if (status === "approved") return <Chip tone="active">Approved</Chip>;
  if (status === "rejected") return <Chip tone="failed">Rejected</Chip>;
  if (status === "awaiting_co") return <Chip tone="review">Compliance review</Chip>;
  return <Chip tone="neutral">{status}</Chip>;
}

const TH = "whitespace-nowrap bg-surface-low px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-secondary";
const TD = "cursor-pointer border-t border-outline-variant px-4 py-[13px] text-[14px] text-on-surface";

export function RedeemTable({
  rows, onRowClick,
}: {
  rows: RedemptionView[];
  onRowClick: (id: string) => void;
}) {
  return (
    <Card pad={false}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr>
              <th className={TH}>Reference</th>
              <th className={TH}>Model</th>
              <th className={`${TH} text-right`}>Multiplier</th>
              <th className={`${TH} text-right`}>Amount</th>
              <th className={TH}>RM</th>
              <th className={TH}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const comp = r.amount > 300000;
              return (
                <tr
                  key={r.id}
                  onClick={() => onRowClick(r.id)}
                  style={r.emergent ? { background: "#fef2f0" } : undefined}
                >
                  <td className={`${TD} font-bold`}>
                    {r.emergent && (
                      <TriangleAlert size={12} strokeWidth={2.4} color="#b71c1c" className="mr-1.5 inline align-[-2px]" />
                    )}
                    {r.ref}
                    {comp && (
                      <Shield size={12} strokeWidth={2} color="#994700" className="ml-1.5 inline align-[-2px]" />
                    )}
                  </td>
                  <td className={TD}>{r.modelName}</td>
                  <td className={`${TD} text-right font-bold tabular-nums`}>{r.mult}×</td>
                  <td className={`${TD} text-right font-bold tabular-nums`}>{fmtMoney(r.amount)}</td>
                  <td className={`${TD} text-secondary`}>{r.rm}</td>
                  <td className={TD}><RedeemStatusChip status={r.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
