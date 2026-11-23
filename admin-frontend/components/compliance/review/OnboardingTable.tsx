"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronRight } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { ClientAvatar, DocProgress, ObStatusChip, ObTypeChip } from "@/components/compliance/Shared";
import { BookChip, BOOK_CHIP } from "@/components/rm/BookAccountStack";
import type { AdminOnboardingRow, BookAccount } from "@/lib/onboarding/types";

const thBase =
  "bg-surface-low px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-secondary whitespace-nowrap";
const tdBase = "border-t border-outline-variant px-4 py-[13px] text-[14px] text-on-surface";

function AccountLines({ accounts }: { accounts: BookAccount[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const title = accounts.map((row) => `${BOOK_CHIP[row.book]} ${row.account}`).join("\n");
  const signature = accounts.map((row) => `${row.book}:${row.account}`).join("|");
  const [collapsedFor, setCollapsedFor] = useState<string | null>(null);
  const collapsed = collapsedFor === signature;

  useLayoutEffect(() => {
    if (collapsed) return;
    const el = ref.current;
    if (!el) return;
    setCollapsedFor(el.scrollHeight > el.clientHeight + 1 ? signature : null);
  }, [signature, collapsed]);

  if (accounts.length === 0) return <span className="text-secondary">—</span>;

  const line = (row: BookAccount) => (
    <span key={row.book} className="inline-flex items-center gap-1.5">
      <BookChip code={row.book} />
      <span className="font-semibold tabular-nums">{row.account}</span>
    </span>
  );

  if (collapsed) {
    return (
      <div title={title} className="flex flex-col items-start gap-1">
        {line(accounts[0])}
        <span className="text-[12px] font-semibold text-secondary">+{accounts.length - 1}</span>
      </div>
    );
  }

  return (
    <div ref={ref} title={title} className="flex max-h-12 flex-col items-start gap-1 overflow-hidden">
      {accounts.map(line)}
    </div>
  );
}

export function OnboardingTable({
  rows, onRowClick, openId,
}: {
  rows: AdminOnboardingRow[];
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
              <th className={thBase}>Accounts</th>
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
                  <td className={tdBase}><AccountLines accounts={o.accounts ?? []} /></td>
                  <td className={`${tdBase} text-center`}><DocProgress documents={o.documents} /></td>
                  <td className={tdBase}>
                    <ObStatusChip status={o.status} />
                  </td>
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
