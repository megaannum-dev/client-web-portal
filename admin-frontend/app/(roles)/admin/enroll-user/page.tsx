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
  AddOverrideModal, CreatedModal, DeactivateModal, ManageOverridesModal, ReactivateModal, ResetModal,
  type CreatedInfo,
} from "@/components/admin/enroll/LifecycleModals";
import { useAdminStore } from "@/lib/admin/AdminStoreContext";
import { PAGE_BY_ID } from "@/lib/admin/catalog";
import { genPassword } from "@/lib/admin/password";
import { TODAY } from "@/lib/mock/admin-data";
import type { AdminUser, EnrollDraft, Role } from "@/lib/admin/types";
import type { PageId } from "@/lib/pages-config";

type View = "directory" | "wizard" | "overrides";

type ModalState =
  | { kind: "audit" }
  | { kind: "reset"; user: AdminUser }
  | { kind: "overrides"; user: AdminUser }
  | { kind: "deactivate"; user: AdminUser }
  | { kind: "reactivate"; user: AdminUser }
  | { kind: "created"; info: CreatedInfo }
  | { kind: "addOverride" };

function blankDraft(): EnrollDraft {
  return {
    mode: "new", first: "", last: "", email: "", phone: "", start: TODAY, addr: "", dept: "",
    role: "", ovr: {}, pw: genPassword(), expiry: "Never", invite: true,
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
  const startEdit = (u: AdminUser) => {
    const [first, ...rest] = u.name.split(" ");
    setDraft({
      mode: "edit", orig: u.email, first, last: rest.join(" "), email: u.email,
      phone: "+41 44 668 21 07", start: TODAY, addr: "Bahnhofstrasse 42, 8001 Zürich, CH",
      dept: u.dept, role: u.role, ovr: {}, pw: genPassword(), expiry: "Never", invite: false,
    });
    setStep(0); setView("wizard"); setKebab(null);
  };
  const patchDraft = (p: Partial<EnrollDraft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const leaveWizard = () => { setView("directory"); setDraft(null); setStep(0); };

  const createUser = () => {
    if (!draft) return;
    const d = draft;
    const name = `${d.first} ${d.last}`.trim();
    const initials = ((d.first[0] || "?") + (d.last[0] || "")).toUpperCase();

    if (d.mode === "edit") {
      store.updateUser(d.orig!, { name, email: d.email, role: d.role as Role });
      store.log("User updated", `${name} · ${d.role}`);
      toast.success(`${name} updated.`);
      leaveWizard();
      return;
    }

    const role = d.role as Role;
    store.addUser({ initials, name, email: d.email, role, dept: "—", status: "Initiated", tone: "pending", seen: "—" });
    Object.entries(d.ovr).forEach(([id, to]) => {
      const pageId = id as PageId;
      const p = PAGE_BY_ID[pageId];
      store.addOverride({ initials, name, role, page: p.label, path: p.path, from: store.eff(pageId, role), to, why: "Set during enrolment", exp: "30 Sep 2026", soon: true });
    });
    store.log("Account created", `${name} · ${d.role} · ${Object.keys(d.ovr).length} override(s)`);
    setModal({ kind: "created", info: { name, email: d.email, roleCode: d.role as Role, pw: d.pw, ovr: Object.keys(d.ovr).length } });
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
          onReset={(u) => setModal({ kind: "reset", user: u })}
          onManageOverrides={(u) => setModal({ kind: "overrides", user: u })}
          onDeactivate={(u) => setModal({ kind: "deactivate", user: u })}
          onReactivate={(u) => setModal({ kind: "reactivate", user: u })}
        />
      )}

      {modal?.kind === "audit" && <AuditModal onClose={closeModal} />}
      {modal?.kind === "reset" && <ResetModal user={modal.user} onClose={closeModal} />}
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
