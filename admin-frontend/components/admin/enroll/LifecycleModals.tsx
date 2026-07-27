"use client";

/* ============================================================
   Enroll User — lifecycle modals
   Ported from admin/admin-app/ProtoModals.jsx: reset password,
   manage overrides (per user), deactivate, reactivate, created
   (post-enroll summary), add override (from the ledger).
   ============================================================ */
import { useState } from "react";
import { toast } from "sonner";
import {
  Ban, Copy, Eye, EyeOff, History, KeyRound, Plus, RefreshCw, RotateCcw, Users, UserRoundPlus, X,
} from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import {
  Checkbox, IconButton, Label, LevelDiff, LevelSeg, Modal, Notice, SelectField, TextField,
} from "@/components/admin/Shared";
import { useAdminStore } from "@/lib/admin/AdminStoreContext";
import { ALL_PAGES, LEVEL_LABEL, PAGE_BY_PATH, ROLE_IDX } from "@/lib/admin/catalog";
import { genPassword } from "@/lib/admin/password";
import type { AdminUser, Level, Role } from "@/lib/admin/types";
import { TODAY } from "@/lib/mock/admin-data";

const EXPIRY_OPTS = ["30 days", "90 days", "30 Sep 2026", "31 Dec 2026", "No expiry"];

/* ---- reset temporary password -------------------------------- */
export function ResetModal({ user: u, onClose }: { user: AdminUser; onClose: () => void }) {
  const store = useAdminStore();
  const [pw, setPw] = useState(genPassword());
  const [exp, setExp] = useState("Never");
  const [mail, setMail] = useState(true);
  return (
    <Modal
      title="Reset temporary password"
      sub={`${u.name} · ${u.status === "Initiated" ? "initiated, not yet signed in" : u.role}`}
      width={430}
      onClose={onClose}
      foot={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <span className="ml-auto">
            <Button icon={KeyRound} onClick={() => {
              store.log("Temporary password reissued", `${u.name} · ${exp === "Never" ? "no expiry" : `expires in ${exp}`}${mail ? " · emailed" : ""}`);
              toast.success(`New temporary password issued for ${u.name}${mail ? " and emailed" : ""}. The previous one no longer works.`);
              onClose();
            }}>
              Issue password
            </Button>
          </span>
        </>
      }
    >
      <TextField label="New temporary password" value={pw} onChange={setPw} mono
        trail={
          <span className="inline-flex gap-1">
            <IconButton icon={RefreshCw} size={14} onClick={() => setPw(genPassword())} />
            <IconButton icon={Copy} size={14} onClick={() => toast.success("Copied to the clipboard.")} />
          </span>
        } />
      <SelectField label="Expires" value={exp} onChange={setExp} options={["Never", "24 hours", "72 hours", "7 days"]} />
      <Checkbox on={mail} onChange={setMail}>Email the new credentials to {u.email}</Checkbox>
      <Notice tone="info">The previous temporary password stops working the moment this is issued.</Notice>
    </Modal>
  );
}

/* ---- manage overrides (per user) ------------------------------ */
export function ManageOverridesModal({ user: u, onClose }: { user: AdminUser; onClose: () => void }) {
  const store = useAdminStore();
  const mine = store.ovrFor(u.name);
  const roleIdx = ROLE_IDX[u.role];
  const [path, setPath] = useState("");
  const [lv, setLv] = useState<Level>("view");
  const [exp, setExp] = useState("90 days");
  const [why, setWhy] = useState("");
  const [touched, setTouched] = useState(false);
  const taken = mine.map((o) => o.path);
  const opts = ALL_PAGES.filter((p) => !taken.includes(p.path)).map((p) => ({ value: p.path, label: `${p.name} · ${p.path}` }));

  const add = () => {
    if (!path || !why.trim()) { setTouched(true); toast.warning("A page and a reason are required."); return; }
    const p = PAGE_BY_PATH[path];
    store.addOverride({ initials: u.initials, name: u.name, role: u.role, page: p.name, path, from: store.eff(path, roleIdx), to: lv, why: why.trim(), exp });
    setPath(""); setWhy(""); setTouched(false);
  };

  return (
    <Modal
      title="Manage overrides"
      sub={`${u.name} · ${u.role} · ${mine.length} active exception${mine.length === 1 ? "" : "s"}`}
      width={520}
      onClose={onClose}
      foot={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <span className="ml-auto"><Button icon={Plus} onClick={add}>Grant override</Button></span>
        </>
      }
    >
      {mine.length === 0 ? (
        <Notice tone="info">No exceptions — {u.name} is on the {u.role} default everywhere.</Notice>
      ) : (
        mine.map((o) => (
          <div key={o.id} className="rounded-xl border border-outline-variant bg-surface-low p-[13px_15px]">
            <div className="flex items-center justify-between gap-3.5">
              <div>
                <div className="text-[13px] font-semibold">{o.page}</div>
                <div className="text-[11.5px] text-secondary">{o.path}</div>
              </div>
              <LevelDiff from={o.from} to={o.to} override />
            </div>
            <div className="mt-[9px] text-[12px] text-secondary">{o.why} · expires <b>{o.exp}</b> · granted by {o.by}</div>
            <div className="mt-[11px] flex gap-2.5">
              <Button variant="secondary" icon={X} onClick={() => store.revokeOverride(o.id)}>Revoke</Button>
            </div>
          </div>
        ))
      )}
      <div className="h-px bg-outline-variant" />
      <Label>Add an exception</Label>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
        <SelectField label="Page" value={path} onChange={setPath} options={opts} placeholder="Select a page…" span required />
        <SelectField label="Level" value={lv} onChange={(v) => setLv(v as Level)} options={[{ value: "none", label: "None" }, { value: "view", label: "View" }, { value: "edit", label: "Edit" }]} />
        <SelectField label="Expires" value={exp} onChange={setExp} options={EXPIRY_OPTS} />
        <TextField label="Reason" value={why} onChange={setWhy} placeholder="Required — shown in the overrides ledger" span required invalid={touched && !why.trim() ? "Required." : null} />
      </div>
      {path && <Notice tone="info">{u.role} default for this page is <b>{LEVEL_LABEL[store.eff(path, roleIdx)]}</b> — this grants <b>{LEVEL_LABEL[lv]}</b>.</Notice>}
    </Modal>
  );
}

/* ---- deactivate ------------------------------------------------ */
export function DeactivateModal({ user: u, onClose }: { user: AdminUser; onClose: () => void }) {
  const store = useAdminStore();
  const held = store.ovrFor(u.name);
  const others = store.users.filter((x) => x.email !== u.email && x.status === "Active").map((x) => x.name);
  const [reassign, setReassign] = useState(true);
  const [to, setTo] = useState(others[0] || "");
  const [why, setWhy] = useState("");
  return (
    <Modal
      title="Deactivate account"
      sub={`${u.name} · ${u.role}`}
      width={520}
      onClose={onClose}
      foot={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <span className="ml-auto">
            <Button icon={Ban} onClick={() => {
              store.setStatus(u.email, "Deactivated");
              store.log("Account deactivated", `${u.name} · ${why.trim() || "no reason given"}${reassign ? ` · 4 open items reassigned to ${to}` : ""}`);
              toast.success(`${u.name} deactivated.${reassign ? ` 4 open items reassigned to ${to}.` : ""}${held.length ? ` ${held.length} override held.` : ""} Reactivate restores the account as it was.`);
              onClose();
            }}>
              Deactivate account
            </Button>
          </span>
        </>
      }
    >
      <Notice tone="warn"><b>Reversible.</b> Sign-in stops immediately, but the account, its role and its overrides are kept — an admin can reactivate and {u.name.split(" ")[0]} is back exactly as before.</Notice>
      <div className="flex flex-col gap-[13px]">
        <div>
          <Checkbox on={reassign} onChange={setReassign}>
            Reassign <b>4 open items</b> to another user
            <span className="mt-[3px] block text-[12px] text-secondary">Work has to keep moving. Reassignment is <b>not</b> undone on reactivation.</span>
          </Checkbox>
          {reassign && (
            <div className="ml-[27px] mt-2.5 max-w-[260px]">
              <SelectField value={to} onChange={setTo} options={others} placeholder="Pick a user…" />
            </div>
          )}
        </div>
        <Checkbox on><b>{held.length} override{held.length === 1 ? "" : "s"}</b> held, not revoked — they resume on reactivation, or expire, whichever comes first</Checkbox>
        <Checkbox on>Sign-in identity stays reserved — the email cannot be reused</Checkbox>
      </div>
      <TextField label="Reason" value={why} onChange={setWhy} placeholder={`Left the firm — ${TODAY}`} span help="Shown on the account and in the audit log." />
    </Modal>
  );
}

/* ---- reactivate -------------------------------------------------- */
export function ReactivateModal({ user: u, onClose }: { user: AdminUser; onClose: () => void }) {
  const store = useAdminStore();
  const held = store.ovrFor(u.name);
  return (
    <Modal
      title="Reactivate account"
      sub={`${u.name} · ${u.role}`}
      width={450}
      onClose={onClose}
      foot={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <span className="ml-auto">
            <Button icon={RotateCcw} onClick={() => {
              store.setStatus(u.email, "Initiated");
              store.log("Account reactivated", `${u.name} · ${u.role} · temporary password required`);
              toast.success(`${u.name} reactivated as ${u.role}. Issue a temporary password so they can sign in.`);
              onClose();
            }}>
              Reactivate account
            </Button>
          </span>
        </>
      }
    >
      <Notice tone="ok">The account returns as <b>{u.role}</b> with {held.length} held override{held.length === 1 ? "" : "s"} resumed. Reassigned work stays where it was moved.</Notice>
      <Notice tone="info">Sign-in needs a fresh temporary password — the account lands back in <b>Initiated</b> until the first sign-in.</Notice>
    </Modal>
  );
}

/* ---- created (post-enroll summary) -------------------------------- */
export interface CreatedInfo { name: string; email: string; roleCode: Role; pw: string; ovr: number }
export function CreatedModal({
  m, onEnrollAnother, onBackToDirectory,
}: { m: CreatedInfo; onEnrollAnother: () => void; onBackToDirectory: () => void }) {
  const [shown, setShown] = useState(false);
  const finish = (again: boolean) => {
    if (again) onEnrollAnother(); else onBackToDirectory();
    toast.success(`${m.name} created · ${m.roleCode}${m.ovr ? ` · ${m.ovr} override` : ""}. The account is in Initiated until the first sign-in.`);
  };
  return (
    <Modal
      title="Account created"
      sub={`${m.name} · ${m.roleCode} · ${m.ovr} override${m.ovr === 1 ? "" : "s"}`}
      width={470}
      onClose={() => finish(false)}
      foot={
        <>
          <Button variant="ghost" icon={UserRoundPlus} onClick={() => finish(true)}>Enroll another</Button>
          <span className="ml-auto"><Button icon={Users} onClick={() => finish(false)}>Back to directory</Button></span>
        </>
      }
    >
      <Notice tone="ok"><b>{m.name.split(" ")[0]} can sign in now</b> as {m.email}. The invitation email has been sent.</Notice>
      <div className="overflow-hidden rounded-xl border border-outline-variant">
        <div className="flex items-center justify-between gap-3 border-b border-outline-variant bg-surface-low px-[15px] py-[11px]">
          <Label>Shown once</Label>
          <Button variant="secondary" icon={Copy} onClick={() => toast.success("Email and temporary password copied to the clipboard.")}>Copy both</Button>
        </div>
        <div className="flex items-center justify-between gap-4 px-[15px] py-3">
          <Label>Email</Label>
          <span className="text-[13.5px] font-semibold">{m.email}</span>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-outline-variant px-[15px] py-3">
          <Label>Temporary password</Label>
          <span className="inline-flex items-center gap-2">
            <span className="font-mono text-[13.5px] font-semibold" style={{ letterSpacing: shown ? 0 : "0.14em" }}>
              {shown ? m.pw : "••••••••••••"}
            </span>
            <IconButton icon={shown ? EyeOff : Eye} size={14} onClick={() => setShown(!shown)} />
          </span>
        </div>
      </div>
      <span className="flex items-center gap-2 text-[12px] text-secondary">
        <History size={14} strokeWidth={1.75} />
        Once this closes, only a password reset can issue a new one.
      </span>
    </Modal>
  );
}

/* ---- add override (from the ledger) -------------------------------- */
export function AddOverrideModal({ onClose }: { onClose: () => void }) {
  const store = useAdminStore();
  const candidates = store.users.filter((u) => u.status !== "Deactivated");
  const [email, setEmail] = useState(candidates[0]?.email ?? "");
  const [path, setPath] = useState("");
  const [lv, setLv] = useState<Level>("view");
  const [why, setWhy] = useState("");
  const [exp, setExp] = useState("30 Sep 2026");
  const [onExp, setOnExp] = useState("Revert to role default");
  const [touched, setTouched] = useState(false);
  const u = candidates.find((x) => x.email === email);
  const roleIdx = u ? ROLE_IDX[u.role] : 0;
  const from: Level = path ? store.eff(path, roleIdx) : "none";

  const submit = () => {
    if (!u || !path || !why.trim()) { setTouched(true); toast.warning("User, page and reason are all required."); return; }
    const p = PAGE_BY_PATH[path];
    store.addOverride({ initials: u.initials, name: u.name, role: u.role, page: p.name, path, from, to: lv, why: why.trim(), exp, soon: exp === "30 Sep 2026" });
    onClose();
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
        <SelectField label="User" value={email} onChange={setEmail} span required options={candidates.map((x) => ({ value: x.email, label: `${x.name} · ${x.role}` }))} />
        <SelectField label="Page" value={path} onChange={setPath} span required placeholder="Select a page…"
          options={ALL_PAGES.map((p) => ({ value: p.path, label: `${p.name} · ${p.path}` }))} />
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
        <SelectField label="On expiry" value={onExp} onChange={setOnExp} options={["Revert to role default", "Notify the admin only"]} />
      </div>
      {exp === "No expiry" ? (
        <Notice tone="warn"><b>No expiry</b> — this shows a standing flag in the ledger and needs a note explaining why it is permanent.</Notice>
      ) : (
        <Notice tone="info">Overrides <b>expire by default</b>. On expiry the user drops back to the {u ? u.role : "role"} default.</Notice>
      )}
    </Modal>
  );
}
