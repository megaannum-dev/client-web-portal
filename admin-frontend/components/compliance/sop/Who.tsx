import { SOP_ROLE_LABELS } from "./roles";
import type { SopVersionDTO } from "@/lib/sop/types";

/** name · role, email beneath. */
export function Who({ v }: { v: SopVersionDTO }) {
  return (
    <div className="min-w-0">
      <div className="text-[14px] font-semibold text-on-surface">
        {v.uploaded_by_name} <span className="font-normal text-secondary">· {SOP_ROLE_LABELS[v.uploaded_by_role] ?? v.uploaded_by_role}</span>
      </div>
      {v.uploaded_by_email && <div className="truncate text-[13px] text-secondary">{v.uploaded_by_email}</div>}
    </div>
  );
}
