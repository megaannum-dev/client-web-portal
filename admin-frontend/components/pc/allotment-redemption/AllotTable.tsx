"use client";

// Allotments table — Action (Acknowledge) is inline on the row; there is NO
// Status column (per spec, acknowledge happens directly from the row).

import { Check } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { fmtMoney, fmtTimestamp } from "@/lib/pc/format";
import type { AllotmentView } from "@/lib/onboarding/types";

const TH = "whitespace-nowrap bg-surface-low px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-secondary";
const TD = "border-t border-outline-variant px-4 py-[13px] text-[14px] text-on-surface";

export function AllotTable({
  rows, onRowClick, onAcknowledge,
}: {
  rows: AllotmentView[];
  onRowClick: (id: string) => void;
  onAcknowledge: (id: string) => void;
}) {
  return (
    <Card pad={false}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse">
          <thead>
            <tr>
              <th className={TH}>Reference</th>
              <th className={TH}>Model</th>
              <th className={`${TH} text-right`}>Multiplier</th>
              <th className={`${TH} text-right`}>Amount</th>
              <th className={TH}>Agg. multiplier</th>
              <th className={TH}>Expected cash-in</th>
              <th className={TH}>RM</th>
              <th className={`${TH} text-right`}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const pending = a.status === "pending";
              return (
                <tr key={a.id}>
                  <td className={`${TD} cursor-pointer font-bold`} onClick={() => onRowClick(a.id)}>{a.ref}</td>
                  <td className={`${TD} cursor-pointer`} onClick={() => onRowClick(a.id)}>{a.modelName}</td>
                  <td className={`${TD} text-right font-bold tabular-nums`}>{a.mult}×</td>
                  <td className={`${TD} text-right tabular-nums`}>{fmtMoney(a.amount)}</td>
                  <td className={`${TD} text-secondary`}>{a.aggBefore}× → {a.aggAfter}×</td>
                  <td className={`${TD} whitespace-nowrap`}>{a.expectedCashIn ? fmtTimestamp(a.expectedCashIn) : "—"}</td>
                  <td className={`${TD} text-secondary`}>{a.rm}</td>
                  <td className={`${TD} text-right`}>
                    {pending ? (
                      <Button
                        variant="secondary"
                        icon={Check}
                        className="px-[13px] py-1.5 text-[13px]"
                        onClick={(e) => { e.stopPropagation(); onAcknowledge(a.id); }}
                      >
                        Acknowledge
                      </Button>
                    ) : (
                      <span className="inline-flex items-center gap-[5px] text-[13px] font-semibold text-secondary">
                        <Check size={14} strokeWidth={2} />Acknowledged
                      </span>
                    )}
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
