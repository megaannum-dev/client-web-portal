import { FormatBadge } from "./FormatBadge";
import { ClassTag, VerTag } from "./Tags";
import { sopActionsFor, type SopRowHandlers } from "./SopCard";
import { Who } from "./Who";
import { fmtDate, fmtSize } from "@/components/compliance/ic-notes/format";
import type { SopDocumentDTO } from "@/lib/sop/types";

const TH = "bg-surface-low px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.05em] text-secondary whitespace-nowrap";
const TD = "border-t border-outline-variant px-4 py-3.5 align-middle text-[14px] text-on-surface";

export function SopTable({ sops, ...h }: { sops: SopDocumentDTO[] } & SopRowHandlers) {
  return (
    <div className="overflow-auto rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
      <table className="w-full min-w-[820px] border-collapse">
        <thead>
          <tr>
            {["Title", "Class", "Version", "Updated", "Updated by"].map((c) => <th key={c} className={TH}>{c}</th>)}
            <th className={`${TH} text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sops.map((s) => {
            const l = s.latest;
            return (
              <tr
                key={s.id}
                onClick={() => h.onOpen(s.id, "overview")}
                className={`cursor-pointer transition-colors duration-150 ${h.openId === s.id ? "bg-[#fff3e8]" : "hover:bg-surface-low"}`}
              >
                <td className={TD}>
                  <div className="flex items-center gap-3">
                    <FormatBadge filename={l.filename} />
                    <div>
                      <div className="font-semibold">{s.title}</div>
                      <div className="text-[12px] text-secondary">{fmtSize(l.size_bytes)}</div>
                    </div>
                  </div>
                </td>
                <td className={TD}><ClassTag category={s.category} /></td>
                <td className={TD}><VerTag version={l.version_no} /></td>
                <td className={`${TD} whitespace-nowrap`}>{fmtDate(l.uploaded_at)}</td>
                <td className={TD}><Who v={l} /></td>
                <td className={`${TD} text-right`}>{sopActionsFor(s, h)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
