"use client";

import { ChevronRight, TriangleAlert } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { CrStatusChip } from "@/components/compliance/Shared";
import { coMoney, crAmt, crModel, type Redemption } from "@/lib/compliance/mock";

const thBase =
  "bg-surface-low px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-secondary whitespace-nowrap";
const tdBase = "border-t border-outline-variant px-4 py-[13px] text-[14px] text-on-surface";

export function RedeemTable({
  rows, onRowClick, openId,
}: {
  rows: Redemption[];
  onRowClick: (id: string) => void;
  openId: string | null;
}) {
  return (
    <Card pad={false} className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 820 }}>
          <thead>
            <tr>
              <th className={thBase}>Reference</th>
              <th className={thBase}>Model</th>
              <th className={`${thBase} text-right`}>Mult</th>
              <th className={`${thBase} text-right`}>Amount</th>
              <th className={thBase}>PC approved</th>
              <th className={thBase}>Status</th>
              <th className={`${thBase} text-right`} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const m = crModel(r.mid);
              const active = r.id === openId;
              return (
                <tr
                  key={r.id}
                  onClick={() => onRowClick(r.id)}
                  className="cursor-pointer"
                  style={{ background: r.emergent ? "#fef2f0" : active ? "var(--surface-low)" : "transparent" }}
                >
                  <td className={`${tdBase} font-bold`}>
                    {r.emergent && (
                      <TriangleAlert size={12} strokeWidth={2.4} color="#b71c1c" className="mr-1.5 inline align-[-2px]" />
                    )}
                    {r.ref}
                  </td>
                  <td className={tdBase}>{m.name}</td>
                  <td className={`${tdBase} text-right font-bold tabular-nums`}>{r.mult}×</td>
                  <td className={`${tdBase} text-right font-bold tabular-nums`}>{coMoney(crAmt(r))}</td>
                  <td className={`${tdBase} whitespace-nowrap text-secondary`}>{r.pcApproved}</td>
                  <td className={tdBase}><CrStatusChip status={r.status} /></td>
                  <td className={`${tdBase} text-right text-secondary`}>
                    <ChevronRight size={16} strokeWidth={2} className="inline" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
