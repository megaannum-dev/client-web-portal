"use client";

// Upload modal — attach a guideline document to a newly onboarded client,
// or upload a new version over an existing guideline (client/name locked).

import { useRef, useState } from "react";
import { File, FileCheck, Upload, X } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import {
  IG_CLIENTS, IG_MANDATES,
  type GuidelineUploadInput, type InvestmentGuideline,
} from "@/lib/pc/investment-guideline-mock";
import { ArModalShell } from "./parts";

const fieldCls =
  "box-border w-full rounded-lg border border-outline bg-white px-3 py-2.5 text-[14px] text-on-surface outline-none";
const labelCls = "mb-[5px] block text-[11px] font-bold uppercase tracking-[0.05em] text-secondary";

export function GuidelineUploadModal({
  existing, onClose, onSubmit,
}: {
  existing: InvestmentGuideline | null;
  onClose: () => void;
  onSubmit: (data: GuidelineUploadInput) => void;
}) {
  const [client, setClient] = useState(existing?.client ?? "");
  const [code, setCode] = useState(existing?.code ?? "");
  const [name, setName] = useState(existing?.name && existing.name !== "—" ? existing.name : "");
  const [mandate, setMandate] = useState(existing?.mandate && existing.mandate !== "—" ? existing.mandate : "");
  const [effective, setEffective] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isNewVersion = !!existing;

  const pickFile = () => fileInputRef.current?.click();
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (f) setFile(f);
  };

  const canSubmit = !!client && !!name && !!mandate;
  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({ client, code, name, mandate, effective: effective || "—", fileName: file?.name ?? "guideline.pdf" });
    onClose();
  };

  return (
    <ArModalShell
      title={isNewVersion ? "Upload new version" : "Upload investment guideline"}
      subtitle={
        isNewVersion
          ? `New version for ${existing.client} · ${existing.ref}`
          : "Attach a guideline document to a newly onboarded client"
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={Upload} onClick={handleSubmit} disabled={!canSubmit}>
            {isNewVersion ? "Upload version" : "Upload guideline"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className={labelCls}>Client</label>
          {isNewVersion ? (
            <div className="text-[14px] font-bold text-on-surface">{existing.client} ({existing.code})</div>
          ) : (
            <select
              value={client}
              onChange={(e) => {
                setClient(e.target.value);
                const c = IG_CLIENTS.find((x) => x.label === e.target.value);
                if (c) setCode(c.code);
              }}
              className={`${fieldCls} cursor-pointer`}
            >
              <option value="">Select client…</option>
              {IG_CLIENTS.map((c) => (
                <option key={c.code} value={c.label}>{c.label} ({c.code})</option>
              ))}
            </select>
          )}
        </div>

        <label className="flex flex-col">
          <span className={labelCls}>Guideline name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Global Growth Mandate — IPS 2026"
            className={fieldCls}
          />
        </label>

        <label className="flex flex-col">
          <span className={labelCls}>Mandate</span>
          <select value={mandate} onChange={(e) => setMandate(e.target.value)} className={`${fieldCls} cursor-pointer`}>
            <option value="">Select mandate…</option>
            {IG_MANDATES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>

        <label className="flex flex-col">
          <span className={labelCls}>Effective date</span>
          <input
            type="date"
            value={effective}
            onChange={(e) => setEffective(e.target.value)}
            className={fieldCls}
          />
        </label>

        <div>
          <label className={labelCls}>Document</label>
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={onPick} />
          <div
            onClick={pickFile}
            className="cursor-pointer rounded-[10px] border-2 border-dashed border-outline px-4 py-6 text-center transition-colors"
            style={{ background: file ? "var(--primary-fixed)" : "var(--surface-low)" }}
          >
            {file ? (
              <div className="flex items-center justify-center gap-2">
                <FileCheck size={18} strokeWidth={2} className="text-primary" />
                <span className="text-[14px] font-semibold text-primary">{file.name}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="flex cursor-pointer p-0.5 text-secondary"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </div>
            ) : (
              <div>
                <File size={22} strokeWidth={1.75} className="mx-auto text-secondary" />
                <div className="mt-1.5 text-[13px] text-secondary">Click to select a PDF document</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ArModalShell>
  );
}
