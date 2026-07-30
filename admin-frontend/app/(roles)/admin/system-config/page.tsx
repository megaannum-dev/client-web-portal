"use client";

/* ============================================================
   System Config — standing page access for every role.
   Ported from admin/admin-app/ProtoConfig.jsx (PMatrix/PRoleView)
   + ProtoModals.jsx (PCellModal/PPublishModal). Header, toolbar
   and the staged-changes bar are identical across both views in
   the handoff, so they're hoisted here instead of duplicated.
   ============================================================ */
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { PageHeader } from "@/components/ui/PageHeader";
import { Eye, History, Save } from "@/lib/icons";
import { ViewSwitch } from "@/components/admin/Shared";
import { AuditModal } from "@/components/admin/AuditModal";
import { Matrix, type CellPayload } from "@/components/admin/config/Matrix";
import { RoleView } from "@/components/admin/config/RoleView";
import { CellModal, PublishModal } from "@/components/admin/config/ConfigModals";
import { ROLE_CODES } from "@/lib/admin/catalog";
import { useAdminStore } from "@/lib/admin/AdminStoreContext";
import type { Role } from "@/lib/admin/types";

type ConfigView = "matrix" | "role";
type ModalState = ({ kind: "cell" } & CellPayload) | { kind: "publish" } | { kind: "audit" } | null;

export default function SystemConfigPage() {
  const { stagedList, totalPages, overrides, published, discard } = useAdminStore();

  const [configView, setConfigView] = useState<ConfigView>("role");
  const [role, setRole] = useState<Role>("PC");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selCell, setSelCell] = useState<string | null>(null);
  const [roleOpenGroup, setRoleOpenGroup] = useState<string[]>(["Middle / Back Office"]);
  const [modal, setModal] = useState<ModalState>(null);
  const closeModal = () => setModal(null);

  const n = stagedList.length;

  const handleDiscard = () => {
    discard();
    toast(`${n} staged change${n === 1 ? "" : "s"} discarded. Published access is untouched.`);
  };

  return (
    <div className="flex flex-col gap-5 p-6">
      <PageHeader
        title="System Config"
        subtitle="Standing page access for every role. Changes apply to all users holding the role."
        actions={
          <>
            <Button variant="secondary" icon={History} onClick={() => setModal({ kind: "audit" })}>Audit log</Button>
            <Button icon={Save} disabled={!n} onClick={() => n && setModal({ kind: "publish" })}>
              {n ? `Publish ${n} change${n === 1 ? "" : "s"}` : "Publish changes"}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-4 rounded-md border border-outline-variant bg-surface-lowest px-3.5 py-2.5">
        <ViewSwitch view={configView} onChange={setConfigView} />
        <span className="h-[26px] w-px bg-outline-variant" />
        <span className="text-[12.5px] text-secondary">
          {totalPages} pages · {ROLE_CODES.length} roles · {overrides.length} per-user exception{overrides.length === 1 ? "" : "s"}
        </span>
        <span className="ml-auto flex items-center gap-2.5">
          {n ? (
            <>
              <Chip tone="warm">{n} unpublished</Chip>
              <span className="text-[12.5px] text-secondary">staged locally</span>
            </>
          ) : (
            <>
              <Chip tone="active">Published</Chip>
              <span className="text-[12.5px] text-secondary">Last published <b>{published.when}</b> by {published.by}</span>
            </>
          )}
        </span>
      </div>

      {n > 0 && (
        <div className="flex items-center gap-3.5 rounded-md border border-primary bg-white px-[18px] py-3 shadow-overlay">
          <Chip tone="warm">{n} unsaved change{n === 1 ? "" : "s"}</Chip>
          <span className="text-[12.5px] text-secondary">Staged locally — no user is affected until you publish.</span>
          <span className="ml-auto flex gap-2.5">
            <Button variant="secondary" icon={Eye} onClick={() => setModal({ kind: "publish" })}>Review diff</Button>
            <Button variant="secondary" onClick={handleDiscard}>Discard</Button>
            <Button icon={Save} onClick={() => setModal({ kind: "publish" })}>Publish changes</Button>
          </span>
        </div>
      )}

      {configView === "matrix" ? (
        <Matrix
          collapsed={collapsed}
          onToggleGroup={(group) => setCollapsed((c) => ({ ...c, [group]: !c[group] }))}
          selCell={selCell}
          onSelectCell={setSelCell}
          onOpenCell={(payload) => setModal({ kind: "cell", ...payload })}
        />
      ) : (
        <RoleView
          role={role}
          onSelectRole={setRole}
          openGroups={roleOpenGroup}
          onToggleGroup={(group) => setRoleOpenGroup((gs) => (gs.includes(group) ? gs.filter((g) => g !== group) : [...gs, group]))}
        />
      )}

      {modal?.kind === "cell" && (
        <CellModal
          payload={{ page_id: modal.page_id, label: modal.label, path: modal.path, role: modal.role }}
          onClose={() => { setSelCell(null); closeModal(); }}
        />
      )}
      {modal?.kind === "publish" && <PublishModal onClose={closeModal} />}
      {modal?.kind === "audit" && <AuditModal onClose={closeModal} />}
    </div>
  );
}
