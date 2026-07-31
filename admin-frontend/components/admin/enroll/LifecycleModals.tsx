"use client";

/* ============================================================
   Enroll User — lifecycle modals
   Ported from admin/admin-app/ProtoModals.jsx: reset password,
   manage overrides (per user), deactivate, reactivate, created
   (post-enroll summary).

   FE-9 follow-up: wired to the API-backed store. Users are now
   StaffOut (keyed by firebase_uid) and overrides are OverrideOut/
   OverrideIn.

   FE-12 (superseded): ResetModal renamed to SendLinkModal, link-only
   creation, no password row. Reverted — enrollment generates a password
   (client-side, previewed/regenerable on the wizard's Credentials step)
   set on the identity at creation; CreatedModal shows it once (below)
   AND reports whether a set-password link was also emailed, so the new
   user can take the account over with their own password instead.
   SendLinkModal (the row-action resend) is unchanged.

   FE-13: AddOverrideModal (add an override from the ledger, not from
   a per-user row) moved to config/ConfigModals.tsx — the ledger it
   serves is now a System Config view. Fix B: this page's own
   ManageOverridesModal (a per-user duplicate of that same ledger) was
   removed entirely — System Config's view is now the only entry point.
   ============================================================ */
import { useState } from "react";
import { toast } from "sonner";
import {
  Ban, Copy, History, Mail, RotateCcw, Users, UserRoundPlus,
} from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import {
  Checkbox, Label, Modal, Notice, SelectField, TextField,
} from "@/components/admin/Shared";
import { useAdminStore } from "@/lib/admin/AdminStoreContext";
import { todayLabel } from "@/lib/admin/today";
import type { Role, StaffOut } from "@/lib/admin/types";

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
export interface CreatedInfo { name: string; email: string; roleCode: Role; linkSent: boolean; password: string; ovr: number }

/** Local copy-to-clipboard row, matching the working pattern in
 *  components/rm/RequestTickets.tsx (copied-state + setTimeout reset). */
function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center justify-between gap-4 px-[15px] py-3">
      <Label>{label}</Label>
      <span className="flex items-center gap-3">
        <span className="text-[13.5px] font-semibold">{value}</span>
        <Button variant="secondary" icon={Copy} onClick={copy}>{copied ? "Copied!" : "Copy"}</Button>
      </span>
    </div>
  );
}

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
      {m.linkSent ? (
        <Notice tone="ok">
          <b>Share the password below with {m.name.split(" ")[0]}</b> — a set-password link has also been emailed to {m.email}, in case they'd rather choose their own.
        </Notice>
      ) : (
        <Notice tone="warn">
          Account created as {m.email}, but <b>the set-password link could not be sent</b>. Share the password directly — use <b>Send set-password link</b> from the directory to retry the link.
        </Notice>
      )}
      <div className="overflow-hidden rounded-xl border border-outline-variant">
        <div className="border-b border-outline-variant bg-surface-low px-[15px] py-[11px]">
          <Label>Sign-in identity</Label>
        </div>
        <CopyRow label="Email" value={m.email} />
        <div className="border-t border-outline-variant">
          <CopyRow label="Temporary password" value={m.password} />
        </div>
      </div>
      <span className="flex items-center gap-2 text-[12px] text-secondary">
        <History size={14} strokeWidth={1.75} />
        This password is shown once — copy it now, it won't be shown again.
      </span>
    </Modal>
  );
}
