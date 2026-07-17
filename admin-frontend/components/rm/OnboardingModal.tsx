"use client";

/* ============================================================
   RM — "Start Onboarding" modal: 3-step form (Basic Info → Trade
   Info → Documents) an RM fills out to create a client record and
   kick off KYC. Ported faithfully from the design handoff prototype
   (Screens.jsx `OnboardingModal`, ~L1563-1738). Decorative only —
   no submit target yet, matching this prototype's fidelity level
   elsewhere (see OnboardingBoard's KYC panel).
   ============================================================ */

import { Fragment, useState, type ChangeEvent, type ReactNode } from "react";
import clsx from "clsx";
import { Modal } from "@/components/rm/Shared";
import { Button } from "@/components/ui/Button";
import { UserRoundPlus, Check, File, Upload, Info } from "@/lib/icons";
import { RM_CLIENTS, OB_MODEL_CATALOG, KYC_DOCS } from "@/lib/mock/rm-data";

const OB_ID_TYPES = ["Hong Kong ID Card", "Passport"];
const OB_DOC_NAMES = KYC_DOCS.none.map(([name]) => name);
const OB_STEPS = ["Basic Info", "Trade Info", "Documents"];
// No compliance/admin privilege distinction in this app yet — locked to the
// current demo user, same as the prototype's `canAssignRm=false` default.
const CURRENT_RM = "Dana Okafor";
const ASSIGNED_RM_OPTIONS = Array.from(new Set(RM_CLIENTS.map((c) => c.assignedRm)));

const inputCls =
  "h-10 rounded border border-outline-variant bg-white px-3 text-[14px] font-semibold text-on-surface outline-none placeholder:font-normal placeholder:text-secondary focus:border-primary";
const selectCls = clsx(inputCls, "cursor-pointer");

interface ObForm {
  clientName: string;
  phone: string;
  email: string;
  address: string;
  country: string;
  idType: string;
  idNumber: string;
  assignedRm: string;
  ibhkId: string;
  swId: string;
  model: string;
  modelUnit: string;
  mgmtFee: string;
  incentiveFee: string;
}

function ObField({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">
        {label}
        {required && <span className="text-primary"> *</span>}
      </span>
      {children}
    </label>
  );
}

export function OnboardingModal({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<ObForm>({
    clientName: "", phone: "", email: "", address: "", country: "",
    idType: OB_ID_TYPES[0], idNumber: "", assignedRm: CURRENT_RM,
    ibhkId: "", swId: "", model: "", modelUnit: "", mgmtFee: "", incentiveFee: "",
  });
  const [docs, setDocs] = useState<Record<string, string>>({});

  const set = (k: keyof ObForm) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onModel = (e: ChangeEvent<HTMLSelectElement>) => {
    const m = OB_MODEL_CATALOG.find((x) => x.name === e.target.value);
    setForm((f) => ({ ...f, model: e.target.value, mgmtFee: m?.mgmtFee ?? f.mgmtFee, incentiveFee: m?.incentiveFee ?? f.incentiveFee }));
  };
  const onDoc = (name: string) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setDocs((d) => ({ ...d, [name]: file.name }));
    e.target.value = "";
  };
  const removeDoc = (name: string) => setDocs((d) => { const n = { ...d }; delete n[name]; return n; });

  const page1Valid = !!(
    form.clientName.trim() && form.phone.trim() && form.email.trim() &&
    form.address.trim() && form.country.trim() && form.idType && form.idNumber.trim()
  );
  const page2Valid = !!(
    form.ibhkId.trim() && form.swId.trim() && form.model &&
    /^[1-9]\d*$/.test(form.modelUnit.trim()) && form.mgmtFee.trim() && form.incentiveFee.trim()
  );
  const stepValid = [page1Valid, page2Valid, true];
  const canSubmit = page1Valid && page2Valid;

  return (
    <Modal
      title="Start Onboarding"
      subtitle="Create a client record and begin KYC verification."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="mr-auto">Cancel</Button>
          {page > 1 && <Button variant="secondary" onClick={() => setPage(page - 1)}>Back</Button>}
          {page < 3 ? (
            <Button onClick={() => setPage(page + 1)}>Next</Button>
          ) : (
            <Button icon={UserRoundPlus} disabled={!canSubmit}>Onboard Client</Button>
          )}
        </>
      }
    >
      {/* stepper — click any step to jump there; navigation is always free,
          the check only reflects that step's own validity */}
      <div className="-mx-[22px] -mt-5 mb-5 flex items-center gap-2 border-b border-outline-variant bg-surface-low px-[22px] py-3.5">
        {OB_STEPS.map((label, i) => {
          const n = i + 1;
          const active = page === n;
          const done = stepValid[i] && !active;
          return (
            <Fragment key={label}>
              <button type="button" onClick={() => setPage(n)} className="flex cursor-pointer items-center gap-2 bg-transparent p-0.5">
                <span
                  className={clsx(
                    "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    active ? "bg-primary text-white" : done ? "bg-primary-fixed text-primary" : "bg-surface-container text-secondary",
                  )}
                >
                  {done ? <Check size={12} strokeWidth={2.5} /> : n}
                </span>
                <span className={clsx("text-[13px]", active ? "font-bold text-on-surface" : "font-semibold text-secondary")}>{label}</span>
              </button>
              {i < OB_STEPS.length - 1 && <span className="h-px flex-1 bg-outline-variant" />}
            </Fragment>
          );
        })}
      </div>

      {page === 1 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <ObField label="Client Name" required>
              <input className={inputCls} value={form.clientName} onChange={set("clientName")} placeholder="e.g. Greystone Partners" />
            </ObField>
          </div>
          <ObField label="Primary Phone" required>
            <input className={inputCls} value={form.phone} onChange={set("phone")} placeholder="+1 (312) 555-0199" />
          </ObField>
          <ObField label="Email" required>
            <input className={inputCls} type="email" value={form.email} onChange={set("email")} placeholder="name@company.com" />
          </ObField>
          <div className="col-span-2">
            <ObField label="Address" required>
              <input className={inputCls} value={form.address} onChange={set("address")} placeholder="Registered address" />
            </ObField>
          </div>
          <ObField label="Country of Residence" required>
            <input className={inputCls} value={form.country} onChange={set("country")} placeholder="e.g. Hong Kong SAR" />
          </ObField>
          <ObField label="ID Type" required>
            <select className={selectCls} value={form.idType} onChange={set("idType")}>
              {OB_ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </ObField>
          <ObField label="ID Number" required>
            <input className={inputCls} value={form.idNumber} onChange={set("idNumber")} placeholder="e.g. A1234567" />
          </ObField>
          <ObField label="Assigned RM">
            <select className={clsx(inputCls, "cursor-not-allowed opacity-60")} value={form.assignedRm} onChange={set("assignedRm")} disabled>
              {ASSIGNED_RM_OPTIONS.map((rm) => <option key={rm} value={rm}>{rm}</option>)}
            </select>
          </ObField>
        </div>
      )}

      {page === 2 && (
        <div className="grid grid-cols-2 gap-4">
          <ObField label="IBHK Account ID" required>
            <input className={inputCls} value={form.ibhkId} onChange={set("ibhkId")} placeholder="e.g. IB-8801" />
          </ObField>
          <ObField label="Silverwater Account ID" required>
            <input className={inputCls} value={form.swId} onChange={set("swId")} placeholder="e.g. SW-4420" />
          </ObField>
          <div className="col-span-2">
            <ObField label="Initial Model to Subscribe" required>
              <select className={selectCls} value={form.model} onChange={onModel}>
                <option value="" disabled>Select a model…</option>
                {OB_MODEL_CATALOG.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
              </select>
            </ObField>
          </div>
          <ObField label="Model Unit" required>
            <input
              className={inputCls}
              inputMode="numeric"
              value={form.modelUnit}
              onChange={(e) => setForm((f) => ({ ...f, modelUnit: e.target.value.replace(/[^\d]/g, "") }))}
              placeholder="e.g. 2"
            />
          </ObField>
          <div />
          <ObField label="Management Fee" required>
            <input className={inputCls} value={form.mgmtFee} onChange={set("mgmtFee")} placeholder="e.g. 1.0%" />
          </ObField>
          <ObField label="Incentive Fee" required>
            <input className={inputCls} value={form.incentiveFee} onChange={set("incentiveFee")} placeholder="e.g. 10%" />
          </ObField>
          <div className="col-span-2 mt-1 flex items-start gap-2.5 rounded-[10px] border border-outline-variant bg-surface-low p-3">
            <Info size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-secondary" />
            <span className="text-[12.5px] leading-relaxed text-secondary">Fees default to the selected model&rsquo;s schedule and can be overwritten.</span>
          </div>
        </div>
      )}

      {page === 3 && (
        <div>
          <p className="mb-3.5 text-[13px] leading-relaxed text-secondary">
            Upload any of the documents below now, or skip and click <b className="text-on-surface">Onboard Client</b> — documents
            can also be added later from the KYC panel.
          </p>
          <div className="flex flex-col gap-2">
            {OB_DOC_NAMES.map((name) => {
              const file = docs[name];
              return (
                <div key={name} className="flex items-center justify-between gap-3 rounded-[10px] border border-outline-variant bg-white px-3.5 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {file ? (
                      <Check size={16} strokeWidth={1.75} className="shrink-0 text-primary" />
                    ) : (
                      <File size={16} strokeWidth={1.75} className="shrink-0 text-secondary" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-semibold text-on-surface">{name}</div>
                      {file && <div className="truncate text-[12px] text-secondary">{file}</div>}
                    </div>
                  </div>
                  {file ? (
                    <button type="button" onClick={() => removeDoc(name)} className="shrink-0 cursor-pointer bg-transparent p-1.5 text-[12.5px] font-semibold text-secondary">
                      Remove
                    </button>
                  ) : (
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded border border-outline px-3 py-1.5 text-[12.5px] font-semibold text-secondary">
                      <Upload size={13} strokeWidth={2} />
                      Upload
                      <input type="file" className="hidden" onChange={onDoc(name)} />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}
