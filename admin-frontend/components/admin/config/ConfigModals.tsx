"use client";

/* ============================================================
   System Config — modals owned by this page (PCellModal /
   PPublishModal in the handoff). The audit log modal is shared
   (components/admin/AuditModal.tsx); per-user lifecycle modals
   belong to Enroll User. AddOverrideModal moved here from
   enroll/LifecycleModals.tsx (FE-13) — it grants ledger-wide
   overrides, which is now a System Config concern.
   ============================================================ */
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import {
  IconButton, LevelBadge, LevelDiff, LevelSeg, Modal, Notice, SelectField, TextField,
} from "@/components/admin/Shared";
import { Check, CheckCircle2, Plus, Save, Undo2 } from "@/lib/icons";
import { ALL_PAGES, EXPIRY_OPTS, LEVEL_LABEL } from "@/lib/admin/catalog";
import { useAdminStore } from "@/lib/admin/AdminStoreContext";
import { expiryToIso } from "@/lib/admin/today";
import type { CellPayload } from "@/components/admin/config/Matrix";
import type { Level, StagedChange } from "@/lib/admin/types";
import type { PageId } from "@/lib/pages-config";

const LEVEL_OPTIONS: [Level, string][] = [
  ["NONE", "Hidden from nav, route blocked"],
  ["VIEW", "Read-only — no writes or actions"],
  ["EDIT", "Full use of the page’s actions"],
];

const isReduction = (s: StagedChange) => s.to === "NONE" || (s.from === "EDIT" && s.to === "VIEW");

/* ---- cell editor --------------------------------------------- */
export function CellModal({ payload, onClose }: { payload: CellPayload; onClose: () => void }) {
  const { eff, stage, roleUsers, overrides } = useAdminStore();
  const { page_id, label, path, role } = payload;
  const cur = eff(page_id, role);
  const [lv, setLv] = useState<Level>(cur);
  const affected = roleUsers(role);
  const ovrHere = overrides.filter((o) => o.page_id === page_id && o.user_role === role).length;

  return (
    <Modal
      title={`${label} × ${role}`}
      sub={path}
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
              stage(page_id, role, lv);
              toast(`Staged — ${label} · ${role}: ${LEVEL_LABEL[cur]} → ${LEVEL_LABEL[lv]}. Nothing changes until you publish.`);
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
            All {role} holders.{ovrHere ? ` ${ovrHere} has an override on this page and will not change.` : ""}
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

  const doPublish = async () => {
    const n = stagedList.length;
    if (!n) return;
    const r = await publish(note.trim());
    if (r.ok) {
      toast.success(`${n} change${n === 1 ? "" : "s"} published — every affected user is updated at next page load.`);
      onClose();
      return;
    }
    if (r.conflict) {
      // Modal STAYS OPEN, staged list intact, diff now recomputed against the fresh levels.
      toast.warning("Someone else published — review again. Your staged changes are unchanged.");
      return;
    }
    toast.error(r.error);
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
          const code = s.role;
          const down = isReduction(s);
          return (
            <div
              key={`${s.page_id}|${s.role}`}
              className="flex items-center justify-between gap-3.5 px-[15px] py-3"
              style={{ borderTop: i ? "1px solid var(--outline-variant)" : "none", background: down ? "#fff8f7" : "#fff" }}
            >
              <div>
                <div className="text-[13px] font-semibold">{s.label}</div>
                <div className="text-[11.5px] text-secondary">{code} · {roleUsers(code)} user{roleUsers(code) === 1 ? "" : "s"}</div>
              </div>
              <span className="inline-flex items-center gap-2.5">
                <LevelDiff from={s.from} to={s.to} />
                <IconButton icon={Undo2} size={14} title="Drop this change" onClick={() => stage(s.page_id, s.role, s.from)} />
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

/* ---- add override (from the ledger) -------------------------------- */
export function AddOverrideModal({ onClose }: { onClose: () => void }) {
  const store = useAdminStore();
  const candidates = store.staff.filter((u) => u.status !== "DEACTIVATED");
  const [uid, setUid] = useState(candidates[0]?.firebase_uid ?? "");
  const [pageId, setPageId] = useState<PageId | "">("");
  const [lv, setLv] = useState<Level>("VIEW");
  const [why, setWhy] = useState("");
  const [exp, setExp] = useState("30 Sep 2026");
  const [touched, setTouched] = useState(false);
  const u = candidates.find((x) => x.firebase_uid === uid);
  const from: Level = pageId && u ? store.eff(pageId, u.role) : "NONE";

  const submit = async () => {
    if (!u || !pageId || !why.trim()) { setTouched(true); toast.warning("User, page and reason are all required."); return; }
    const ok = await store.addOverride({ firebase_uid: u.firebase_uid, page_id: pageId, level: lv, reason: why.trim(), expires_at: expiryToIso(exp) });
    if (ok) onClose();
  };

  return (
    <Modal
      title="Add override"
      sub="A per-user exception to the role default"
      width={520}
      onClose={onClose}
      foot={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <span className="ml-auto"><Button icon={Plus} onClick={submit}>Grant override</Button></span>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
        <SelectField label="User" value={uid} onChange={setUid} span required options={candidates.map((x) => ({ value: x.firebase_uid, label: `${x.name} · ${x.role}` }))} />
        <SelectField label="Page" value={pageId} onChange={(v) => setPageId(v as PageId)} span required placeholder="Select a page…"
          options={ALL_PAGES.map((p) => ({ value: p.page_id, label: `${p.label} · ${p.path}` }))} />
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-low px-[15px] py-3">
        <span className="text-[12.5px] text-secondary">Role default</span>
        <LevelDiff from={from} to={lv} override />
        <span className="text-[12.5px] text-secondary">granted for this user</span>
        <span className="ml-auto"><LevelSeg value={lv} onChange={setLv} /></span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
        <TextField label="Reason" value={why} onChange={setWhy} span required placeholder="Covering guideline sign-off during Q3"
          invalid={touched && !why.trim() ? "Required." : null} help="Required. Appears in the ledger and the audit log." />
        <SelectField label="Expires" value={exp} onChange={setExp} options={EXPIRY_OPTS} />
      </div>
      {exp === "No expiry" ? (
        <Notice tone="warn"><b>No expiry</b> — this shows a standing flag in the ledger and needs a note explaining why it is permanent.</Notice>
      ) : (
        <Notice tone="info">Overrides <b>expire by default</b>. On expiry the user drops back to the {u ? u.role : "role"} default.</Notice>
      )}
    </Modal>
  );
}
