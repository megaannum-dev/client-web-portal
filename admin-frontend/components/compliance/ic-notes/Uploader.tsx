import type { IcNoteRole } from "@/lib/ic-notes/types";

// No existing role->label map fit for reuse (grep turned up none); kept local,
// same five roles pages-config.ts's Role type carries.
export const ROLE_LABELS: Record<IcNoteRole, string> = {
  PM: "Portfolio Manager",
  PC: "Portfolio Commander",
  COMPLIANCE: "Compliance Officer",
  MOBO: "MOBO",
  ADMIN: "Admin",
  RM: "RM",
};

/** name (bold) · role, + email on its own line when present. Used by NoteCard's footer. */
export function Uploader({
  name, role, email,
}: {
  name: string;
  role: IcNoteRole;
  email: string | null;
}) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[14px] font-semibold text-on-surface">
        {name} <span className="font-normal text-secondary">· {ROLE_LABELS[role] ?? role}</span>
      </div>
      {email && <div className="truncate text-[13px] text-secondary">{email}</div>}
    </div>
  );
}
