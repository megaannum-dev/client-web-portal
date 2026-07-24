"use client";

import { ChevronRight, File } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import type { Guideline } from "@/lib/compliance/mock";

export function GrStatusChip({ status }: { status: string }) {
  return status === "active"
    ? <Chip tone="active" dot={false}>Active</Chip>
    : <Chip tone="neutral" dot={false}>{status}</Chip>;
}

export function VersionBadge({ v }: { v: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-surface-container px-2.5 py-[3px] text-[12px] font-bold text-secondary">
      <File size={12} strokeWidth={2} />v{v}
    </span>
  );
}

const thBase =
  "bg-surface-low px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-secondary whitespace-nowrap";
const tdBase = "border-t border-outline-variant px-4 py-[13px] text-[14px] text-on-surface";

export function GuidelineTable({
  rows, onRowClick, openId,
}: {
  rows: Guideline[];
  onRowClick: (id: string) => void;
  openId: string | null;
}) {
  return (
    <Card pad={false} className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th className={thBase}>Guideline</th>
              <th className={thBase}>Client</th>
              <th className={thBase}>Mandate</th>
              <th className={thBase}>PM</th>
              <th className={thBase}>Effective</th>
              <th className={thBase}>Version</th>
              <th className={`${thBase} text-right`} />
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => {
              const active = g.id === openId;
              return (
                <tr
                  key={g.id}
                  onClick={() => onRowClick(g.id)}
                  className="cursor-pointer"
                  style={{ background: active ? "var(--surface-low)" : "transparent" }}
                >
                  <td className={tdBase}>
                    <div className="font-bold">{g.name}</div>
                    <div className="mt-0.5 text-[12px] text-secondary">{g.ref}</div>
                  </td>
                  <td className={`${tdBase} text-secondary`}>{g.client}</td>
                  <td className={`${tdBase} text-secondary`}>{g.mandate}</td>
                  <td className={`${tdBase} text-secondary`}>{g.pm}</td>
                  <td className={`${tdBase} whitespace-nowrap text-secondary`}>{g.effective}</td>
                  <td className={tdBase}><VersionBadge v={g.version} /></td>
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
