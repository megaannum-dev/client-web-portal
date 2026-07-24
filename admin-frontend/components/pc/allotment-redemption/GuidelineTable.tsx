"use client";

// Investment Guideline table — PC's submission queue. Clicking a row with
// no document yet opens the upload modal directly (handled by the caller);
// rows with a document open the detail panel.

import { Chip } from "@/components/ui/Chip";
import { Card } from "@/components/ui/Card";
import { File, ChevronRight } from "@/lib/icons";
import type { InvestmentGuideline } from "@/lib/pc/investment-guideline-mock";

const TH = "whitespace-nowrap bg-surface-low px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-secondary";
const TD = "cursor-pointer border-t border-outline-variant px-4 py-[13px] text-[14px] text-on-surface";

function VersionPill({ version }: { version: number }) {
  return (
    <span className="inline-flex items-center gap-[5px] rounded-[7px] bg-surface-container px-[9px] py-[3px] text-[12px] font-bold text-secondary">
      <File size={12} strokeWidth={2} />v{version}
    </span>
  );
}

export function GuidelineTable({
  rows, onRowClick, openId,
}: {
  rows: InvestmentGuideline[];
  onRowClick: (id: string) => void;
  openId: string | null;
}) {
  return (
    <Card pad={false}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse">
          <thead>
            <tr>
              <th className={TH}>Guideline</th>
              <th className={TH}>Client</th>
              <th className={TH}>Last update</th>
              <th className={TH}>Version</th>
              <th className={TH}>Status</th>
              <th className={`${TH} text-right`} />
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr
                key={g.id}
                onClick={() => onRowClick(g.id)}
                className={g.id === openId ? "bg-surface-low" : undefined}
              >
                <td className={`${TD} font-bold`}>
                  {g.status === "pending" ? (
                    <span className="italic text-secondary">Awaiting upload</span>
                  ) : (
                    g.name
                  )}
                </td>
                <td className={`${TD} text-secondary`}>
                  {g.client} <span className="text-[12px] opacity-70">({g.code})</span>
                </td>
                <td className={`${TD} whitespace-nowrap text-secondary`}>{g.uploaded}</td>
                <td className={TD}>
                  {g.version > 0 ? <VersionPill version={g.version} /> : <span className="text-[12px] text-secondary">—</span>}
                </td>
                <td className={TD}>
                  <Chip tone={g.status === "pending" ? "pending" : "active"} dot={false}>
                    {g.status === "pending" ? "Pending upload" : "Uploaded"}
                  </Chip>
                </td>
                <td className={`${TD} text-right text-secondary`}>
                  <ChevronRight size={16} strokeWidth={2} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
