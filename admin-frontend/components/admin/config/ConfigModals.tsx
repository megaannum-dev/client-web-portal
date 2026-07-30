"use client";

/* ============================================================
   System Config — modals owned by this page (PCellModal /
   PPublishModal in the handoff). The audit log modal is shared
   (components/admin/AuditModal.tsx); lifecycle modals belong to
   Enroll User.
   ============================================================ */
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { IconButton, LevelBadge, LevelDiff, Modal, Notice, TextField } from "@/components/admin/Shared";
import { Check, CheckCircle2, Save, Undo2 } from "@/lib/icons";
import { LEVEL_LABEL, ROLES } from "@/lib/admin/catalog";
import { useAdminStore } from "@/lib/admin/AdminStoreContext";
import type { CellPayload } from "@/components/admin/config/Matrix";
import type { Level, StagedChange } from "@/lib/admin/types";

const LEVEL_OPTIONS: [Level, string][] = [
  ["NONE", "Hidden from nav, route blocked"],
  ["VIEW", "Read-only — no writes or actions"],
  ["EDIT", "Full use of the page’s actions"],
];

const isReduction = (s: StagedChange) => s.to === "NONE" || (s.from === "EDIT" && s.to === "VIEW");

/* ---- cell editor --------------------------------------------- */
export function CellModal({ payload, onClose }: { payload: CellPayload; onClose: () => void }) {
  const { eff, stage, roleUsers, overrides } = useAdminStore();
  const { name, path, roleIdx } = payload;
  const roleCode = ROLES[roleIdx].code;
  const roleName = ROLES[roleIdx].name;
  const cur = eff(path, roleIdx);
  const [lv, setLv] = useState<Level>(cur);
  const affected = roleUsers(roleCode);
  const ovrHere = overrides.filter((o) => o.path === path && o.role === roleCode).length;

  return (
    <Modal
      title={`${name} × ${roleCode}`}
      sub={`${path} · ${roleName}`}
      width={450}
      onClose={onClose}
      foot={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            className="ml-auto"
            icon={Check}
            disabled={lv === cur}
            onClick={() => {
              if (lv === cur) return;
              stage(path, roleIdx, lv);
              toast(`Staged — ${name} · ${roleCode}: ${LEVEL_LABEL[cur]} → ${LEVEL_LABEL[lv]}. Nothing changes until you publish.`);
              onClose();
            }}
          >
            Stage change
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {LEVEL_OPTIONS.map(([k, txt]) => {
          const on = k === lv;
          return (
            <div
              key={k}
              onClick={() => setLv(k)}
              className="flex cursor-pointer items-center gap-3 rounded-[11px] px-3.5 py-[11px] transition-all"
              style={{ background: on ? "rgba(242,116,5,0.06)" : "#fff", border: `1px solid ${on ? "var(--primary)" : "var(--outline-variant)"}` }}
            >
              <LevelBadge level={k} />
              <div>
                <div className="text-[13.5px] font-bold" style={{ color: on ? "var(--primary)" : "var(--on-surface)" }}>{LEVEL_LABEL[k]}</div>
                <div className="text-[12px] text-secondary">{txt}</div>
              </div>
              {on && <span className="ml-auto flex text-primary"><CheckCircle2 size={17} strokeWidth={2} /></span>}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3.5 rounded-md border border-outline-variant bg-surface-low px-[15px] py-3">
        <span className="text-[24px] font-bold leading-none text-primary">{affected}</span>
        <div>
          <div className="text-[13px] font-bold">user{affected === 1 ? "" : "s"} affected</div>
          <div className="text-[12px] text-secondary">
            All {roleCode} holders.{ovrHere ? ` ${ovrHere} has an override on this page and will not change.` : ""}
          </div>
        </div>
      </div>
      <Notice tone="info">Staged only — nothing changes for users until you publish.</Notice>
    </Modal>
  );
}

/* ---- publish diff ---------------------------------------------- */
export function PublishModal({ onClose }: { onClose: () => void }) {
  const { stagedList, stage, roleUsers, publish } = useAdminStore();
  const [note, setNote] = useState("");
  const removals = stagedList.filter(isReduction);

  const doPublish = () => {
    const n = stagedList.length;
    if (!n) return;
    publish(note.trim());
    toast.success(`${n} change${n === 1 ? "" : "s"} published — every affected user is updated at next page load.`);
    onClose();
  };

  return (
    <Modal
      title={`Publish ${stagedList.length} change${stagedList.length === 1 ? "" : "s"}`}
      sub="Applies to every user holding the affected roles"
      width={520}
      onClose={onClose}
      foot={
        <>
          <Button variant="secondary" onClick={onClose}>Keep editing</Button>
          <Button className="ml-auto" icon={Save} onClick={doPublish}>Publish changes</Button>
        </>
      }
    >
      <div className="overflow-hidden rounded-md border border-outline-variant">
        {stagedList.map((s, i) => {
          const code = ROLES[s.role].code;
          const down = isReduction(s);
          return (
            <div
              key={`${s.path}|${s.role}`}
              className="flex items-center justify-between gap-3.5 px-[15px] py-3"
              style={{ borderTop: i ? "1px solid var(--outline-variant)" : "none", background: down ? "#fff8f7" : "#fff" }}
            >
              <div>
                <div className="text-[13px] font-semibold">{s.name}</div>
                <div className="text-[11.5px] text-secondary">{code} · {roleUsers(code)} user{roleUsers(code) === 1 ? "" : "s"} · {s.path}</div>
              </div>
              <span className="inline-flex items-center gap-2.5">
                <LevelDiff from={s.from} to={s.to} />
                <IconButton icon={Undo2} size={14} title="Drop this change" onClick={() => stage(s.path, s.role, s.from)} />
              </span>
            </div>
          );
        })}
      </div>
      {removals.length > 0 && (
        <Notice tone="warn">
          <b>{removals.length} reduction{removals.length === 1 ? "" : "s"}.</b> Affected users lose access and will see the change at next page load.
        </Notice>
      )}
      <TextField
        label="Change note"
        value={note}
        onChange={setNote}
        span
        placeholder="Q3 control review — reconciliation read access for PC"
        help="Attached to this publish in the audit log."
      />
    </Modal>
  );
}
