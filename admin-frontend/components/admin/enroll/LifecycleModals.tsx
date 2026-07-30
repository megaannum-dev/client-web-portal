"use client";

/* ============================================================
   Enroll User — lifecycle modals
   Ported from admin/admin-app/ProtoModals.jsx: reset password,
   manage overrides (per user), deactivate, reactivate, created
   (post-enroll summary), add override (from the ledger).

   FE-9 follow-up: wired to the API-backed store. Users are now
   StaffOut (keyed by firebase_uid) and overrides are OverrideOut/
   OverrideIn.

   FE-12: ResetModal renamed to SendLinkModal (no more generated
   password / expiry select — sendLink is the only credential path).
   CreatedModal switches its lead notice on StaffCreatedOut.link_sent
   and its "Shown once" panel loses the password row entirely.
   ============================================================ */
import { useState } from "react";
import { toast } from "sonner";
import {
  Ban, Copy, History, Mail, Plus, RotateCcw, Users, UserRoundPlus, X,
} from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import {
  Checkbox, Label, LevelDiff, LevelSeg, Modal, Notice, SelectField, TextField,
} from "@/components/admin/Shared";
import { useAdminStore } from "@/lib/admin/AdminStoreContext";
import { ALL_PAGES, LEVEL_LABEL } from "@/lib/admin/catalog";
import { todayLabel } from "@/lib/admin/today";
import type { Level, Role, StaffOut } from "@/lib/admin/types";
import type { PageId } from "@/lib/pages-config";

const EXPIRY_OPTS = ["30 days", "90 days", "30 Sep 2026", "31 Dec 2026", "No expiry"];

/** "30 days" / "30 Sep 2026" / "No expiry" -> an ISO instant, or null (no expiry). */
function expiryToISO(exp: string): string | null {
  if (exp === "No expiry") return null;
  const relative = /^(\d+)\s+days$/.exec(exp);
  if (relative) {
    const d = new Date();
    d.setDate(d.getDate() + Number(relative[1]));
    return d.toISOString();
  }
  const d = new Date(exp);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** An `expires_at` ISO instant (or null) -> the console's short display format. */
function expiryLabel(iso: string | null): string {
  if (!iso) return "No expiry";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : todayLabel(d);
}

/* ---- send set-password link -------------------------------- */
export function SendLinkModal({ user: u, onClose }: { user: StaffOut; onClose: () => void }) {
  const { sendLink } = useAdminStore();
  const [mail, setMail] = useState(true);
  return (
    <Modal
      title="Send set-password link"
      sub={`${u.name} · ${u.status === "INITIATED" ? "initiated, not yet signed in" : u.role}`}
      width={430}
      onClose={onClose}
      foot={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <span className="ml-auto">
            <Button icon={Mail} onClick={async () => {
              const ok = await sendLink(u.firebase_uid);
              if (ok) toast.success(`A set-password link was sent to ${u.name}. The previous one no longer works.`);
              onClose();
            }}>
              Send link
            </Button>
          </span>
        </>
      }
    >
      <Checkbox on={mail} onChange={setMail}>Email the link to {u.email}</Checkbox>
      <Notice tone="info">Any earlier unused link stops working the moment this is sent.</Notice>
    </Modal>
  );
}

/* ---- manage overrides (per user) ------------------------------ */
export function ManageOverridesModal({ user: u, onClose }: { user: StaffOut; onClose: () => void }) {
  const store = useAdminStore();
  const mine = store.ovrFor(u.firebase_uid);
  const [pageId, setPageId] = useState<PageId | "">("");
  const [lv, setLv] = useState<Level>("VIEW");
  const [exp, setExp] = useState("90 days");
  const [why, setWhy] = useState("");
  const [touched, setTouched] = useState(false);
  const taken = mine.map((o) => o.page_id);
  const opts = ALL_PAGES.filter((p) => !taken.includes(p.page_id)).map((p) => ({ value: p.page_id, label: `${p.label} · ${p.path}` }));

  const add = async () => {
    if (!pageId || !why.trim()) { setTouched(true); toast.warning("A page and a reason are required."); return; }
    const ok = await store.addOverride({ firebase_uid: u.firebase_uid, page_id: pageId, level: lv, reason: why.trim(), expires_at: expiryToISO(exp) });
    if (ok) { setPageId(""); setWhy(""); setTouched(false); }
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
                <div className="text-[13px] font-semibold">{o.page_label}</div>
                <div className="text-[11.5px] text-secondary">{o.page_path}</div>
              </div>
              <LevelDiff from={o.role_default} to={o.level} override />
            </div>
            <div className="mt-[9px] text-[12px] text-secondary">{o.reason} · expires <b>{expiryLabel(o.expires_at)}</b> · granted by {o.granted_by}</div>
            <div className="mt-[11px] flex gap-2.5">
              <Button variant="secondary" icon={X} onClick={() => store.revokeOverride(o.id)}>Revoke</Button>
            </div>
          </div>
        ))
      )}
      <div className="h-px bg-outline-variant" />
      <Label>Add an exception</Label>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
        <SelectField label="Page" value={pageId} onChange={(v) => setPageId(v as PageId)} options={opts} placeholder="Select a page…" span required />
        <SelectField label="Level" value={lv} onChange={(v) => setLv(v as Level)} options={[{ value: "NONE", label: "None" }, { value: "VIEW", label: "View" }, { value: "EDIT", label: "Edit" }]} />
        <SelectField label="Expires" value={exp} onChange={setExp} options={EXPIRY_OPTS} />
        <TextField label="Reason" value={why} onChange={setWhy} placeholder="Required — shown in the overrides ledger" span required invalid={touched && !why.trim() ? "Required." : null} />
      </div>
      {pageId && <Notice tone="info">{u.role} default for this page is <b>{LEVEL_LABEL[store.eff(pageId, u.role)]}</b> — this grants <b>{LEVEL_LABEL[lv]}</b>.</Notice>}
    </Modal>
  );
}

/* ---- deactivate ------------------------------------------------ */
export function DeactivateModal({ user: u, onClose }: { user: StaffOut; onClose: () => void }) {
  const { staff, ovrFor, updateStaff } = useAdminStore();
  const held = ovrFor(u.firebase_uid);

  /** The handover is scoped to RMs with a non-empty book. Every other role owns nothing
   *  per-person (Backend C-11), so the control is NOT RENDERED for them. */
  const needsHandover = u.role === "RM" && (u.client_count ?? 0) > 0;
  const receivers = staff.filter(
    (x) => x.role === "RM" && x.status === "ACTIVE" && x.firebase_uid !== u.firebase_uid,
  ); // filtered from the directory the page already holds — no new fetch
  const [to, setTo] = useState("");
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
            <Button icon={Ban} disabled={needsHandover && !to} onClick={async () => {
              const ok = await updateStaff(u.firebase_uid, {
                status: "DEACTIVATED",
                deactivate_reason: why.trim() || null,
                ...(needsHandover ? { reassign_book_to: to } : {}),
              });
              if (ok) { toast.success(`${u.name} deactivated.`); onClose(); }
            }}>
              Deactivate account
            </Button>
          </span>
        </>
      }
    >
      <Notice tone="warn"><b>Reversible.</b> Sign-in stops immediately, but the account, its role and its overrides are kept — an admin can reactivate and {u.name?.split(" ")[0] ?? "this user"} is back exactly as before.</Notice>
      <div className="flex flex-col gap-[13px]">
        {needsHandover && (
          <div>
            {/* SAME slot the checkbox occupied. Now a REQUIRED field, not an opt-in. */}
            <Label>Hand this RM&apos;s book to <span style={{ color: "var(--primary)" }}>*</span></Label>
            <span className="mt-[3px] block text-[12px] text-secondary">
              <b>{u.client_count} clients</b> and <b>{u.open_ticket_count} open tickets</b> move to the
              receiving RM. Closed tickets stay on the record as {u.name}&apos;s.
              Reassignment is <b>not</b> undone on reactivation.
            </span>
            <div className="ml-[27px] mt-2.5 max-w-[260px]">
              <SelectField value={to} onChange={setTo} placeholder="Pick a receiving RM…"
                options={receivers.map((r) => ({ value: r.firebase_uid, label: `${r.name} · ${r.client_count ?? 0} clients` }))} />
            </div>
          </div>
        )}
        <Checkbox on><b>{held.length} override{held.length === 1 ? "" : "s"}</b> held, not revoked — they resume on reactivation, or expire, whichever comes first</Checkbox>
        <Checkbox on>Sign-in identity stays reserved — the email cannot be reused</Checkbox>
      </div>
      <TextField label="Reason" value={why} onChange={setWhy} placeholder={`Left the firm — ${todayLabel()}`} span help="Shown on the account and in the audit log." />
    </Modal>
  );
}

/* ---- reactivate -------------------------------------------------- */
export function ReactivateModal({ user: u, onClose }: { user: StaffOut; onClose: () => void }) {
  const store = useAdminStore();
  const held = store.ovrFor(u.firebase_uid);
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
            <Button icon={RotateCcw} onClick={async () => {
              const ok = await store.updateStaff(u.firebase_uid, { status: "ACTIVE" });
              if (!ok) return;
              await store.sendLink(u.firebase_uid);
              toast.success(`${u.name} reactivated as ${u.role}. A set-password link has been sent so they can sign in.`);
              onClose();
            }}>
              Reactivate account
            </Button>
          </span>
        </>
      }
    >
      <Notice tone="ok">The account returns as <b>{u.role}</b> with {held.length} held override{held.length === 1 ? "" : "s"} resumed. Reassigned work stays where it was moved.</Notice>
      <Notice tone="info">Sign-in needs a fresh set-password link — the account lands back in <b>Initiated</b> until the first sign-in.</Notice>
    </Modal>
  );
}

/* ---- created (post-enroll summary) -------------------------------- */
export interface CreatedInfo { name: string; email: string; roleCode: Role; link_sent: boolean; ovr: number }
export function CreatedModal({
  m, onEnrollAnother, onBackToDirectory,
}: { m: CreatedInfo; onEnrollAnother: () => void; onBackToDirectory: () => void }) {
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
      {m.link_sent ? (
        <Notice tone="ok">
          <b>{m.name.split(" ")[0]} can set their password now</b> as {m.email}. The invitation email has been sent.
        </Notice>
      ) : (
        <Notice tone="warn">
          Account created as {m.email}, but <b>the invitation email could not be sent</b>. Re-send it from the row menu.
        </Notice>
      )}
      <div className="overflow-hidden rounded-xl border border-outline-variant">
        <div className="flex items-center justify-between gap-3 border-b border-outline-variant bg-surface-low px-[15px] py-[11px]">
          <Label>Sign-in identity</Label>
          <Button variant="secondary" icon={Copy} onClick={() => toast.success("Email copied to the clipboard.")}>Copy</Button>
        </div>
        <div className="flex items-center justify-between gap-4 px-[15px] py-3">
          <Label>Email</Label>
          <span className="text-[13.5px] font-semibold">{m.email}</span>
        </div>
      </div>
      {m.link_sent && (
        <span className="flex items-center gap-2 text-[12px] text-secondary">
          <History size={14} strokeWidth={1.75} />
          The link expires — re-send it from the row menu if they miss it.
        </span>
      )}
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
  const [onExp, setOnExp] = useState("Revert to role default");
  const [touched, setTouched] = useState(false);
  const u = candidates.find((x) => x.firebase_uid === uid);
  const from: Level = pageId && u ? store.eff(pageId, u.role) : "NONE";

  const submit = async () => {
    if (!u || !pageId || !why.trim()) { setTouched(true); toast.warning("User, page and reason are all required."); return; }
    const ok = await store.addOverride({ firebase_uid: u.firebase_uid, page_id: pageId, level: lv, reason: why.trim(), expires_at: expiryToISO(exp) });
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
