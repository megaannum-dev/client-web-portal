"use client";

/* ============================================================
   RM — "Start Onboarding" modal: 3-step form (Basic Info → Trade
   Info → Documents) an RM fills out to create a client record and
   kick off KYC. Ported faithfully from the design handoff prototype
   (Screens.jsx `OnboardingModal`, ~L1563-1738). "Onboard Client"
   calls the real POST /api/rm/onboardings route (FE-3), then
   uploads any files staged in the Documents step against the new
   onboarding id (real POST .../documents/{doc_type} calls, same as
   the KYC panel) — nothing is submitted until that final click, but
   nothing selected here is silently lost either.
   ============================================================ */

import { Fragment, useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import clsx from "clsx";
import { Modal } from "@/components/rm/Shared";
import { Button } from "@/components/ui/Button";
import { UserRoundPlus, Check, File, Upload, Info } from "@/lib/icons";
import { useOnboardingBoard } from "@/hooks/api/useOnboardingBoard";
import { useModels } from "@/hooks/api/useModels";
import { parseFeePercent } from "@/lib/onboarding/fee";
import type { DocSpecDTO, RmOptionDTO } from "@/lib/onboarding/types";

const OB_ID_TYPES = ["Hong Kong ID Card", "Passport"];
const OB_STEPS = ["Basic Info", "Trade Info", "Documents"];

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
  const { startOnboarding, uploadDocument, fetchRmOptions, fetchDocSpecs } = useOnboardingBoard();
  const { data: models } = useModels();
  const liveModels = (models ?? []).filter((m) => m.status === "live");
  const [rmOptions, setRmOptions] = useState<RmOptionDTO[]>([]);
  const [docSpecs, setDocSpecs] = useState<DocSpecDTO[]>([]);
  const [page, setPage] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ObForm>({
    clientName: "", phone: "", email: "", address: "", country: "",
    idType: OB_ID_TYPES[0], idNumber: "", assignedRm: "",
    ibhkId: "", swId: "", model: "", modelUnit: "", mgmtFee: "", incentiveFee: "",
  });
  // Keyed by doc_type (not label) — staged Files to upload against the real
  // onboarding id once it exists, right before closing (FE bug: this used to
  // be a filename-only preview that never reached the server at all).
  const [docs, setDocs] = useState<Record<string, File>>({});

  // Server pre-scopes this list to what the caller may assign: every RM for
  // ADMIN, just the caller's own row for anyone else -- so the same always-
  // enabled select naturally has "only yourself" to pick when you're an RM.
  // Always preselect the first option: an unmatched value="" on a controlled
  // <select> renders the first <option> as selected in the DOM regardless,
  // so leaving form state empty just desyncs it from what's visibly shown.
  useEffect(() => {
    fetchRmOptions().then((r) => {
      if (!r.success || !r.data || r.data.length === 0) return;
      setRmOptions(r.data);
      setForm((f) => (f.assignedRm ? f : { ...f, assignedRm: r.data![0].uid }));
    });
  }, [fetchRmOptions]);

  // Same 7-doc catalog the KYC panel renders (compliance_doc_config.py) —
  // fetched here instead of hardcoded so the two surfaces can never diverge.
  useEffect(() => {
    fetchDocSpecs().then((r) => { if (r.success && r.data) setDocSpecs(r.data); });
  }, [fetchDocSpecs]);

  const set = (k: keyof ObForm) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onModel = (e: ChangeEvent<HTMLSelectElement>) => {
    const m = liveModels.find((x) => x.id === e.target.value);
    setForm((f) => ({
      ...f,
      model: e.target.value,
      mgmtFee: m ? `${m.mgmt}%` : f.mgmtFee,
      incentiveFee: m ? `${m.incentive}%` : f.incentiveFee,
    }));
  };
  const onDoc = (docType: string) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setDocs((d) => ({ ...d, [docType]: file }));
    e.target.value = "";
  };
  const removeDoc = (docType: string) => setDocs((d) => { const n = { ...d }; delete n[docType]; return n; });

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

  async function handleSubmit() {
    const model = liveModels.find((m) => m.id === form.model);
    if (!model) return;
    setSubmitting(true);
    try {
      const result = await startOnboarding({
        client_name: form.clientName, email: form.email, primary_phone: form.phone,
        address: form.address, country_of_residence: form.country,
        id_type: form.idType, id_number: form.idNumber,
        ibhk_account: form.ibhkId, sw_account: form.swId,
        model_id: model.id,
        units: Number(form.modelUnit),
        mgmt_fee: parseFeePercent(form.mgmtFee),
        incentive_fee: parseFeePercent(form.incentiveFee),
        ...(form.assignedRm ? { assigned_rm_uid: form.assignedRm } : {}),
      });
      if (!result.success) {
        alert(`Could not start onboarding: ${result.error}`);
        return;
      }
      // Client record exists now — push every doc staged in step 3 for real.
      const failures: string[] = [];
      for (const [docType, file] of Object.entries(docs)) {
        const r = await uploadDocument(result.id!, docType, file);
        if (!r.success) failures.push(docSpecs.find((s) => s.doc_type === docType)?.label ?? docType);
      }
      if (failures.length) alert(`Client created, but these documents failed to upload — add them from the KYC panel: ${failures.join(", ")}`);
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Invalid fee value");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="Start Onboarding"
      subtitle="Create a client record and begin KYC verification."
      onClose={onClose}
      centered
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="mr-auto" disabled={submitting}>Cancel</Button>
          {page > 1 && <Button variant="secondary" onClick={() => setPage(page - 1)} disabled={submitting}>Back</Button>}
          {page < 3 ? (
            <Button onClick={() => setPage(page + 1)}>Next</Button>
          ) : (
            <Button icon={UserRoundPlus} disabled={!canSubmit || submitting} onClick={handleSubmit}>
              {submitting ? "Onboarding…" : "Onboard Client"}
            </Button>
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
          <ObField label="ID Type" required>
            <select className={selectCls} value={form.idType} onChange={set("idType")}>
              {OB_ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </ObField>
          <ObField label="ID Number" required>
            <input className={inputCls} value={form.idNumber} onChange={set("idNumber")} placeholder="e.g. A1234567" />
          </ObField>
          <ObField label="Country of Residence" required>
            <input className={inputCls} value={form.country} onChange={set("country")} placeholder="e.g. Hong Kong SAR" />
          </ObField>
          <ObField label="Assigned RM">
            <select className={selectCls} value={form.assignedRm} onChange={set("assignedRm")}>
              {rmOptions.map((rm) => <option key={rm.uid} value={rm.uid}>{rm.name}</option>)}
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
                {liveModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
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
            {docSpecs.map((spec) => {
              const file = docs[spec.doc_type];
              return (
                <div key={spec.doc_type} className="flex items-center justify-between gap-3 rounded-[10px] border border-outline-variant bg-white px-3.5 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {file ? (
                      <Check size={16} strokeWidth={1.75} className="shrink-0 text-primary" />
                    ) : (
                      <File size={16} strokeWidth={1.75} className="shrink-0 text-secondary" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-semibold text-on-surface">{spec.label}</div>
                      {file && <div className="truncate text-[12px] text-secondary">{file.name}</div>}
                    </div>
                  </div>
                  {file ? (
                    <button type="button" onClick={() => removeDoc(spec.doc_type)} className="shrink-0 cursor-pointer bg-transparent p-1.5 text-[12.5px] font-semibold text-secondary">
                      Remove
                    </button>
                  ) : (
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded border border-outline px-3 py-1.5 text-[12.5px] font-semibold text-secondary">
                      <Upload size={13} strokeWidth={2} />
                      Upload
                      <input type="file" className="hidden" onChange={onDoc(spec.doc_type)} />
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
