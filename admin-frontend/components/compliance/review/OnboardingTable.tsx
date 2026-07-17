"use client";

import { ChevronRight } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { ClientAvatar, DocProgress, ObStatusChip, ObTypeChip } from "@/components/compliance/Shared";
import type { Onboarding } from "@/lib/compliance/mock";

const thBase =
  "bg-surface-low px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-secondary whitespace-nowrap";
const tdBase = "border-t border-outline-variant px-4 py-[13px] text-[14px] text-on-surface";

export function OnboardingTable({
  rows, onRowClick, openId,
}: {
  rows: Onboarding[];
  onRowClick: (id: string) => void;
  openId: string | null;
}) {
  return (
    <Card pad={false} className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 820 }}>
          <thead>
            <tr>
              <th className={thBase}>Client</th>
              <th className={thBase}>RM</th>
              <th className={thBase}>Submitted</th>
              <th className={thBase}>Type</th>
              <th className={`${thBase} text-center`}>Docs</th>
              <th className={thBase}>Status</th>
              <th className={`${thBase} text-right`} />
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const active = o.id === openId;
              return (
                <tr
                  key={o.id}
                  onClick={() => onRowClick(o.id)}
                  className="cursor-pointer"
                  style={{ background: active ? "var(--surface-low)" : "transparent" }}
                >
                  <td className={tdBase}>
                    <div className="flex items-center gap-[11px]">
                      <ClientAvatar name={o.client} />
                      <div>
                        <div className="font-bold">{o.client}</div>
                        <div className="mt-0.5 text-[12px] text-secondary">{o.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className={`${tdBase} text-secondary`}>{o.rm}</td>
                  <td className={`${tdBase} whitespace-nowrap text-secondary`}>{o.submitted}</td>
                  <td className={tdBase}><ObTypeChip type={o.type} /></td>
                  <td className={`${tdBase} text-center`}><DocProgress docs={o.docs} /></td>
                  <td className={tdBase}><ObStatusChip status={o.status} /></td>
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
