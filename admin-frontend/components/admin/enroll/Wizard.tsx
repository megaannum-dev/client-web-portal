"use client";

/* ============================================================
   Enroll User — the 4-step enrolment / edit wizard
   Ported from admin/admin-app/ProtoEnroll.jsx (PWizard/PStepper).
   Editing an existing user skips the "Access review" step —
   overrides are managed from their own dialog instead.
   ============================================================ */
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, Copy, Mail, MapPin,
  Phone, RefreshCw, Save, UserRoundPlus,
} from "@/lib/icons";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Checkbox, Help, IconButton, Label, Notice, SelectField, TextField } from "@/components/admin/Shared";
import { AccessEditor } from "@/components/admin/AccessEditor";
import { useAdminStore } from "@/lib/admin/AdminStoreContext";
import { ALL_PAGES, ROLE_CODES, LEVEL_LABEL, PAGE_BY_ID } from "@/lib/admin/catalog";
import { genPassword } from "@/lib/admin/password";
import type { EnrollDraft, Level } from "@/lib/admin/types";
import type { PageId } from "@/lib/pages-config";

type StepKey = "identity" | "role" | "access" | "creds";

export interface WizardProps {
  draft: EnrollDraft;
  step: number;
  setStep: (n: number) => void;
  patchDraft: (p: Partial<EnrollDraft>) => void;
  openGroups: string[];
  onToggleGroup: (g: string) => void;
  onLeave: () => void;
  onSubmit: () => void;
}

export function Wizard({ draft: d, step, setStep, patchDraft, openGroups, onToggleGroup, onLeave, onSubmit }: WizardProps) {
  const store = useAdminStore();
  const [touched, setTouched] = useState(false);
  const role = d.role || null;

  const emailBad = !!d.email && !/@megaannum\.ai$/.test(d.email.trim());
  const isEdit = d.mode === "edit";
  const keys: StepKey[] = isEdit ? ["identity", "role", "creds"] : ["identity", "role", "access", "creds"];
  const cur = keys[step];
  const last = step === keys.length - 1;
  const step0ok = !!d.first.trim() && !!d.last.trim() && !!d.email.trim() && !emailBad;
  const canNext = cur === "identity" ? step0ok : cur === "role" ? !!d.role : true;

  const valueFor = (pageId: PageId): Level => (pageId in d.ovr ? d.ovr[pageId] : store.eff(pageId, role ?? ROLE_CODES[0]));
  const defaultFor = (pageId: PageId): Level => store.eff(pageId, role ?? ROLE_CODES[0]);
  const setLevel = (pageId: PageId, lv: Level) => {
    const next = { ...d.ovr };
    if (lv === defaultFor(pageId)) delete next[pageId]; else next[pageId] = lv;
    patchDraft({ ovr: next });
  };
  const ovrCount = Object.keys(d.ovr).length;
  const granted = role == null ? 0 : ALL_PAGES.filter((p) => valueFor(p.page_id) !== "NONE").length;

  const DONE: Record<StepKey, string> = {
    identity: `${d.first} ${d.last}`.trim() + (d.email ? ` · ${d.email}` : ""),
    role: d.role || "—",
    access: `${granted} of ${store.totalPages} pages · ${ovrCount} override${ovrCount === 1 ? "" : "s"}`,
    creds: isEdit ? "Credentials unchanged" : "Temporary password issued",
  };
  const LABEL: Record<StepKey, string> = { identity: "Identity", role: "Role", access: "Access review", creds: "Credentials" };
  const SUB: Record<StepKey, string> = { identity: "Who is joining.", role: "What they hold.", access: "What that grants.", creds: "How they get in." };
  const HEAD: Record<StepKey, ReactNode> = {
    identity: <>The work email becomes the sign-in identity and cannot be changed later.</>,
    role: <>One role per user — it sets the standing page access defined in <b>System Config</b>.</>,
    access: <>Resolved from the role. Any level changed here is recorded as a <b>per-user override</b>, with a reason and an expiry. Groups collapse — open only what you are changing.</>,
    creds: isEdit
      ? <>Reissue sign-in credentials for {d.first || "this user"}. Leave them alone to keep the current password.</>
      : <>How {d.first || "this user"} gets in the first time. Nothing is sent until you create the account.</>,
  };

  const next = () => {
    if (!canNext) {
      setTouched(true);
      toast.warning(cur === "identity" ? "Fill first name, last name and a @megaannum.ai email." : "Pick a role to continue.");
      return;
    }
    setTouched(false);
    setStep(Math.min(step + 1, keys.length - 1));
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-headline-xl font-bold tracking-tight text-on-surface">{isEdit ? "Edit user" : "Enroll User"}</h1>
          <p className="mt-1 text-body-lg text-secondary">
            {isEdit ? `${d.first} ${d.last} · ${d.email}` : "New internal user · draft held locally"}
          </p>
        </div>
        <div className="flex shrink-0 gap-3 pt-1">
          <Button variant="ghost" icon={ArrowLeft} onClick={onLeave}>Back to directory</Button>
          <Button
            variant="secondary"
            icon={Save}
            onClick={() => toast.success("Draft saved. It stays here until you create the account.")}
          >
            Save draft
          </Button>
        </div>
      </div>

      <section className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-lowest">
        <div className="flex items-stretch">
          <div className="flex w-[274px] shrink-0 flex-col gap-5 border-r border-outline-variant bg-surface-low py-[22px] pl-6 pr-[22px]">
            <div>
              <Label>Step {step + 1} of {keys.length}</Label>
              <div className="mt-3.5">
                <Stepper cur={step} steps={keys.map((k) => LABEL[k])} subs={keys.map((k) => SUB[k])} done={keys.map((k) => DONE[k])} onGo={setStep} />
              </div>
            </div>
            {step > 0 && (
              <div className="mt-auto flex items-center gap-[11px] rounded-xl border border-outline-variant bg-white p-[11px_13px]">
                <Avatar initial={d.first[0] || "?"} size={34} />
                <div className="min-w-0">
                  <div className="text-[13.5px] font-bold">{`${d.first} ${d.last}`.trim() || "New user"}</div>
                  <div className="overflow-hidden text-ellipsis text-[12px] text-secondary">
                    {step === 1 ? d.email : `${d.role || "—"} · ${granted} of ${store.totalPages} pages`}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="px-[26px] pt-[22px]">
              <h2 className="text-[20px] font-bold tracking-[-0.01em] text-on-surface">{LABEL[cur]}</h2>
              <Help className="mt-[5px] max-w-[640px]">{HEAD[cur]}</Help>
            </div>

            <div className="flex-1 px-[26px] pb-[22px] pt-[18px]">
              {cur === "identity" && (
                <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                  <TextField label="First name" value={d.first} onChange={(v) => patchDraft({ first: v })} placeholder="Sofia" required
                    invalid={touched && !d.first.trim() ? "Required." : null} />
                  <TextField label="Last name" value={d.last} onChange={(v) => patchDraft({ last: v })} placeholder="Petrova" required
                    invalid={touched && !d.last.trim() ? "Required." : null} />
                  <TextField label="Work email" value={d.email} onChange={(v) => patchDraft({ email: v })} placeholder="s.petrova@megaannum.ai"
                    icon={Mail} required span
                    invalid={emailBad ? "Must be a @megaannum.ai address." : touched && !d.email.trim() ? "Required." : null}
                    help={<>Must be a <b>@megaannum.ai</b> address.</>} />
                  <TextField label="Phone" value={d.phone} onChange={(v) => patchDraft({ phone: v })} placeholder="+41 44 668 21 07" icon={Phone} />
                  <TextField label="Start date" value={d.start} onChange={(v) => patchDraft({ start: v })} icon={CalendarDays} help="Defaults to today." />
                  <TextField label="Correspondence address" value={d.addr} onChange={(v) => patchDraft({ addr: v })} placeholder="Bahnhofstrasse 42, 8001 Zürich, CH" icon={MapPin} span />
                </div>
              )}

              {cur === "role" && (
                <div className="flex flex-col gap-3.5">
                  <div className="grid grid-cols-3 gap-3">
                    {ROLE_CODES.map((code) => {
                      const on = code === d.role;
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => patchDraft({ role: code, ovr: {} })}
                          className="flex flex-col items-start gap-1 rounded-xl px-[15px] py-3.5 text-left transition-all"
                          style={{ background: on ? "rgba(242,116,5,0.06)" : "#fff", border: `1px solid ${on ? "var(--primary)" : "var(--outline-variant)"}` }}
                        >
                          <span className="flex items-center gap-[7px] text-[14px] font-bold" style={{ color: on ? "var(--primary)" : "var(--on-surface)" }}>
                            {on && <CheckCircle2 size={15} strokeWidth={2} />}{code}
                          </span>
                          <span className="mt-1 text-[11.5px] text-secondary">{store.grantedFor(code)} of {store.totalPages} pages</span>
                        </button>
                      );
                    })}
                  </div>
                  <Notice tone="info">
                    {isEdit
                      ? <>Changing the role swaps the whole standing access set. Existing exceptions stay — manage them from <b>Manage overrides</b> in the directory.</>
                      : "Access is never set per person here — pick the closest role, then adjust on the next step if this person genuinely differs."}
                  </Notice>
                </div>
              )}

              {cur === "access" && (
                <div className="flex flex-col gap-3.5">
                  <AccessEditor valueFor={valueFor} defaultFor={defaultFor} onSet={setLevel}
                    openGroups={openGroups} onToggleGroup={onToggleGroup} stagedOn={(p) => p in d.ovr} />
                  {ovrCount > 0 ? (
                    <Notice tone="warn">
                      <b>{ovrCount} override{ovrCount === 1 ? "" : "s"} on this account:</b>{" "}
                      {Object.keys(d.ovr).map((id) => {
                        const pageId = id as PageId;
                        return `${PAGE_BY_ID[pageId].label}, ${LEVEL_LABEL[defaultFor(pageId)]} → ${LEVEL_LABEL[d.ovr[pageId]]}`;
                      }).join(" · ")}. Each is recorded with a reason and an expiry.
                    </Notice>
                  ) : (
                    <Notice tone="info">No exceptions — {d.role} defaults apply exactly. Change any level above to record an override.</Notice>
                  )}
                </div>
              )}

              {cur === "creds" && (
                <div className="grid grid-cols-2 items-start gap-x-5 gap-y-4">
                  <TextField label="Temporary password" value={d.pw} onChange={(v) => patchDraft({ pw: v })} mono
                    trail={
                      <span className="inline-flex gap-1">
                        <IconButton icon={RefreshCw} size={14} title="Generate a new one"
                          onClick={() => { patchDraft({ pw: genPassword() }); toast("New temporary password generated."); }} />
                        <IconButton icon={Copy} size={14} title="Copy"
                          onClick={() => toast.success("Temporary password copied to the clipboard.")} />
                      </span>
                    }
                    help="12 characters, generated. Must be changed at first sign-in." />
                  <SelectField label="Password expires" value={d.expiry} onChange={(v) => patchDraft({ expiry: v })} options={["Never", "24 hours", "72 hours", "7 days"]}
                    help={d.expiry === "Never" ? "The temporary password stays valid until it is used or reset." : "After this an admin must reissue one."} />
                  <div className="rounded-xl border border-outline-variant bg-surface-low p-[14px_16px]" style={{ gridColumn: "1 / -1" }}>
                    <Checkbox on={d.invite} onChange={(v) => patchDraft({ invite: v })}>
                      Email the invitation to <b>{d.email || "the work email"}</b>
                    </Checkbox>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <Notice tone="warn"><b>Creates the account immediately</b> — no second approver. The temporary password is shown once, on the screen after this.</Notice>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 border-t border-outline-variant bg-surface-low px-[26px] py-3.5">
              <Button variant="ghost" onClick={onLeave}>Cancel</Button>
              <span className="ml-auto flex gap-3">
                {step > 0 && <Button variant="secondary" onClick={() => setStep(step - 1)}>Back</Button>}
                {last
                  ? <Button icon={isEdit ? Save : UserRoundPlus} onClick={onSubmit}>{isEdit ? "Save changes" : "Create account"}</Button>
                  : <Button iconRight={ArrowRight} onClick={next}>Next</Button>}
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Stepper({ cur, onGo, done, steps, subs }: { cur: number; onGo: (i: number) => void; done: string[]; steps: string[]; subs: string[] }) {
  return (
    <div className="flex flex-col">
      {steps.map((label, i) => {
        const active = i === cur;
        const past = i < cur;
        return (
          <div key={label} className="flex items-start gap-3">
            <div className="flex shrink-0 flex-col items-center self-stretch">
              <span
                className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[12px] font-bold"
                style={{
                  background: active ? "var(--primary)" : past ? "rgba(242,116,5,0.14)" : "#fff",
                  border: active || past ? "none" : "1px solid var(--outline-variant)",
                  color: active ? "#fff" : past ? "var(--primary)" : "var(--secondary)",
                }}
              >
                {past ? <Check size={13} strokeWidth={3} /> : i + 1}
              </span>
              {i < steps.length - 1 && (
                <span className="w-0.5 flex-1" style={{ minHeight: 24, background: past ? "rgba(242,116,5,0.28)" : "var(--outline-variant)" }} />
              )}
            </div>
            <div
              onClick={() => (i <= cur ? onGo(i) : undefined)}
              className="min-w-0"
              style={{ paddingBottom: i < steps.length - 1 ? 18 : 0, cursor: i <= cur ? "pointer" : "default" }}
            >
              <div className="text-[13.5px] leading-[26px]" style={{ fontWeight: active ? 700 : 600, color: active || past ? "var(--on-surface)" : "var(--secondary)" }}>
                {label}
              </div>
              <div className="mt-px text-[12px] leading-[1.4] text-secondary">{past ? (done[i] || "—") : active ? subs[i] : "—"}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
