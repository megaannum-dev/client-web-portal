"use client";

/* ============================================================
   Enroll User — internal-user directory, enrol/edit wizard, and
   the per-user overrides ledger. Ported from the design handoff's
   admin/admin-app/{ProtoEnroll,ProtoModals,ProtoConfig}.jsx.

   Three page-local views (not in the shared store, same as any
   other route's local UI state): directory | wizard | overrides.
   ============================================================ */
import { useState } from "react";
import { toast } from "sonner";
import { AuditModal } from "@/components/admin/AuditModal";
import { Directory } from "@/components/admin/enroll/Directory";
import { Wizard } from "@/components/admin/enroll/Wizard";
import { OverridesLedger } from "@/components/admin/enroll/OverridesLedger";
import {
  AddOverrideModal, CreatedModal, DeactivateModal, ManageOverridesModal, ReactivateModal, SendLinkModal,
  type CreatedInfo,
} from "@/components/admin/enroll/LifecycleModals";
import { useAdminStore } from "@/lib/admin/AdminStoreContext";
import { expiryToIso, isoDateOrNull, todayLabel } from "@/lib/admin/today";
import type { EnrollDraft, PageId, Role, StaffOut } from "@/lib/admin/types";

/** The reason recorded on every override created by the enroll wizard — the literal
 *  the Access step's own Notice shows (Wizard.tsx). Named once, not repeated. */
const OVERRIDE_REASON = "Set during enrolment";

type View = "directory" | "wizard" | "overrides";

type ModalState =
  | { kind: "audit" }
  | { kind: "sendLink"; user: StaffOut }
  | { kind: "overrides"; user: StaffOut }
  | { kind: "deactivate"; user: StaffOut }
  | { kind: "reactivate"; user: StaffOut }
  | { kind: "created"; info: CreatedInfo }
  | { kind: "addOverride" };

function blankDraft(): EnrollDraft {
  return {
    mode: "new", first: "", last: "", email: "", phone: "", start: todayLabel(), addr: "", dept: "",
    role: "", ovr: {}, ovrExpiry: "90 days", invite: true,
  };
}

export default function EnrollUserPage() {
  const store = useAdminStore();
  const [view, setView] = useState<View>("directory");
  const [filter, setFilter] = useState("All");
  const [dirQuery, setDirQuery] = useState("");
  const [kebab, setKebab] = useState<string | null>(null);
  const [draft, setDraft] = useState<EnrollDraft | null>(null);
  const [step, setStep] = useState(0);
  const [openGroups, setOpenGroups] = useState<string[]>(["Portfolio Control"]);
  const [modal, setModal] = useState<ModalState | null>(null);

  const closeModal = () => setModal(null);
  const toggleGroup = (g: string) => setOpenGroups((gs) => (gs.includes(g) ? gs.filter((x) => x !== g) : [...gs, g]));

  const startEnroll = () => { setDraft(blankDraft()); setStep(0); setView("wizard"); setKebab(null); };
  const startEdit = (u: StaffOut) => {
    const [first, ...rest] = (u.name ?? "").split(" ");
    setDraft({
      mode: "edit", orig: u.firebase_uid, first, last: rest.join(" "), email: u.email ?? "",
      phone: u.phone_number ?? "", start: todayLabel(), addr: "Bahnhofstrasse 42, 8001 Zürich, CH",
      dept: u.department ?? "", role: u.role, ovr: {}, ovrExpiry: "90 days", invite: false,
    });
    setStep(0); setView("wizard"); setKebab(null);
  };
  const patchDraft = (p: Partial<EnrollDraft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const leaveWizard = () => { setView("directory"); setDraft(null); setStep(0); };

  const createUser = async () => {
    if (!draft) return;
    const d = draft;
    const name = `${d.first} ${d.last}`.trim();

    if (d.mode === "edit") {
      const ok = await store.updateStaff(d.orig!, { name, email: d.email, role: d.role as Role });
      if (!ok) return;
      toast.success(`${name} updated.`);
      leaveWizard();
      return;
    }

    const created = await store.enroll({
      email: d.email.trim(), first_name: d.first.trim(), last_name: d.last.trim(), role: d.role as Role,
      phone_number: d.phone.trim() || null, department: d.dept.trim() || null,
      start_date: isoDateOrNull(d.start), address: d.addr.trim() || null,
      send_link: d.invite,
      overrides: (Object.keys(d.ovr) as PageId[]).map((page_id) => ({
        page_id,
        level: d.ovr[page_id]!,
        reason: OVERRIDE_REASON,
        expires_at: expiryToIso(d.ovrExpiry),
      })),
    });
    if (!created) return;
    setModal({ kind: "created", info: { name, email: created.email, roleCode: created.role, link_sent: created.link_sent, ovr: created.override_count } });
  };

  return (
    <div className="flex flex-col gap-5 p-6">
      {view === "wizard" && draft ? (
        <Wizard
          draft={draft} step={step} setStep={setStep} patchDraft={patchDraft}
          openGroups={openGroups} onToggleGroup={toggleGroup}
          onLeave={leaveWizard} onSubmit={createUser}
        />
      ) : view === "overrides" ? (
        <OverridesLedger onBack={() => setView("directory")} onAddOverride={() => setModal({ kind: "addOverride" })} />
      ) : (
        <Directory
          filter={filter} onFilterChange={setFilter}
          query={dirQuery} onQueryChange={setDirQuery}
          kebab={kebab} onKebabChange={setKebab}
          onOverrides={() => setView("overrides")}
          onAudit={() => setModal({ kind: "audit" })}
          onEnroll={startEnroll}
          onEdit={startEdit}
          onReset={(u) => setModal({ kind: "sendLink", user: u })}
          onManageOverrides={(u) => setModal({ kind: "overrides", user: u })}
          onDeactivate={(u) => setModal({ kind: "deactivate", user: u })}
          onReactivate={(u) => setModal({ kind: "reactivate", user: u })}
        />
      )}

      {modal?.kind === "audit" && <AuditModal onClose={closeModal} />}
      {modal?.kind === "sendLink" && <SendLinkModal user={modal.user} onClose={closeModal} />}
      {modal?.kind === "overrides" && <ManageOverridesModal user={modal.user} onClose={closeModal} />}
      {modal?.kind === "deactivate" && <DeactivateModal user={modal.user} onClose={closeModal} />}
      {modal?.kind === "reactivate" && <ReactivateModal user={modal.user} onClose={closeModal} />}
      {modal?.kind === "created" && (
        <CreatedModal
          m={modal.info}
          onEnrollAnother={() => { closeModal(); startEnroll(); }}
          onBackToDirectory={() => { closeModal(); leaveWizard(); setFilter("All"); }}
        />
      )}
      {modal?.kind === "addOverride" && <AddOverrideModal onClose={closeModal} />}
    </div>
  );
}
