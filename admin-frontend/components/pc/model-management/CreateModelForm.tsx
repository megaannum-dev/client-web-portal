"use client";

import { useRef, useState } from "react";
import { ChevronDown, FileText, Clock, Check, Upload, X } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Modal, Ticks } from "@/components/pc/Shared";
import { fmtMoney } from "@/lib/pc/format";
import type { ModelStatus } from "@/lib/pc/types";

/* ============================================================
   MODALS — create / edit model
   ============================================================ */

/* A labelled form field. Read-only (display div) by default — that is
   the Edit-model path, which stays display-only as in the prototype.
   When `onChange` is supplied it renders a live <input> / <select>,
   used by the New-model form. */
export function CreateField({
  label, value, placeholder, select, onChange, options, inputMode,
}: {
  label: string;
  value?: string;
  placeholder?: string;
  select?: boolean;
  onChange?: (v: string) => void;
  options?: string[];
  inputMode?: "numeric" | "decimal";
}) {
  const labelEl = (
    <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">{label}</span>
  );

  if (onChange === undefined) {
    return (
      <label className="flex flex-col gap-1.5">
        {labelEl}
        <div
          className={`flex h-10 items-center gap-2 rounded border border-outline-variant bg-white px-3 text-[14px] ${
            select ? "justify-between" : "justify-start"
          } ${value ? "font-semibold text-on-surface" : "font-normal text-secondary"}`}
        >
          <span>{value || placeholder}</span>
          {select && <ChevronDown size={15} strokeWidth={2} className="text-secondary" />}
        </div>
      </label>
    );
  }

  if (select) {
    return (
      <label className="flex flex-col gap-1.5">
        {labelEl}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 cursor-pointer rounded border border-outline-variant bg-white px-3 text-[14px] font-semibold text-on-surface outline-none focus:border-primary"
        >
          {(options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1.5">
      {labelEl}
      <input
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded border border-outline-variant bg-white px-3 text-[14px] font-semibold text-on-surface outline-none placeholder:font-normal placeholder:text-secondary focus:border-primary"
      />
    </label>
  );
}

/* A labelled multi-line text field — same visual language as `CreateField`,
   used for the free-text prospectus fields (description / underlyings /
   risk) which don't fit a single-line input. */
export function CreateTextArea({
  label, value, placeholder, onChange, rows = 3,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="[field-sizing:content] resize-y rounded border border-outline-variant bg-white px-3 py-2 text-[14px] font-semibold leading-[1.4] text-on-surface outline-none placeholder:font-normal placeholder:text-secondary focus:border-primary"
      />
    </label>
  );
}

/** Parse a fee-percentage text input into the stored value. Fees are kept on
 * the SAME whole-number percentage scale as `Model.mgmt` / `Model.incentive`
 * (e.g. "2.5" => 2.5, meaning 2.5%) — see `lib/pc/models.ts`
 * (`mgmt: dto.mgmt_fee ?? DEFAULT_MGMT_PCT`) and `lib/pc/format.ts`
 * (`m.mgmt / 100`), which both treat `mgmt_fee` as already-whole-number.
 * Empty or unparsable input => null (falls back to the hardcoded default). */
export function parseFeePercent(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Build a `NewModelDraft` payload sent up to `handleCreate`. */
export interface NewModelDraft {
  name: string;
  category: string | null;
  subscription_redemption: string | null;
  size: number;
  symbols: string[];
  status: ModelStatus;
  file: File | null;
  description?: string;
  underlyings?: string;
  risk?: string;
  liquidity?: string;
  reporting?: string;
  nav_perf?: string;
  mgmt_fee?: number | null;
  incentive_fee?: number | null;
}

/* ---- New-model form (create live or draft) -----------------
   `initial` pre-fills the form (used by Duplicate). The material file is
   never copied — even on duplicate the user must attach their own. */
export function CreateModelForm({
  onClose,
  onCreate,
  initial,
}: {
  onClose: () => void;
  onCreate: (m: NewModelDraft) => void;
  initial?: {
    name: string;
    category?: string | null;
    subscription_redemption?: string | null;
    size: number;
    symbols: string[];
    description?: string;
    underlyings?: string;
    risk?: string;
    liquidity?: string;
    reporting?: string;
    nav_perf?: string;
    mgmt_fee?: number | null;
    incentive_fee?: number | null;
  };
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<string>(initial?.category ?? "");
  const [subscriptionRedemption, setSubscriptionRedemption] = useState<string>(initial?.subscription_redemption ?? "");
  const [size, setSize] = useState(initial?.size ? String(initial.size) : "");
  const [symbols, setSymbols] = useState<string[]>(initial?.symbols ?? ["SPY", "QQQ", "IWM"]);
  const [file, setFile] = useState<File | null>(null);
  const [addingSym, setAddingSym] = useState(false);
  const [draftSym, setDraftSym] = useState("");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [underlyings, setUnderlyings] = useState(initial?.underlyings ?? "");
  const [risk, setRisk] = useState(initial?.risk ?? "");
  const [liquidity, setLiquidity] = useState(initial?.liquidity ?? "");
  const [reporting, setReporting] = useState(initial?.reporting ?? "");
  const [navPerf, setNavPerf] = useState(initial?.nav_perf ?? "");
  const [mgmtFee, setMgmtFee] = useState(initial?.mgmt_fee != null ? String(initial.mgmt_fee) : "");
  const [incentiveFee, setIncentiveFee] = useState(initial?.incentive_fee != null ? String(initial.incentive_fee) : "");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const commitSym = () => {
    const s = draftSym.trim().toUpperCase();
    if (s && !symbols.includes(s)) setSymbols((xs) => [...xs, s]);
    setDraftSym("");
    setAddingSym(false);
  };

  const valid = name.trim().length > 0;
  // Publish prerequisite: a live model requires at least one material (v1).
  const canPublish = valid && !!file;

  const submit = (status: ModelStatus) => {
    if (!valid) return;
    if (status === "live" && !file) return;
    onCreate({
      name: name.trim(),
      category: category || null,
      subscription_redemption: subscriptionRedemption || null,
      size: Number(size) || 0,
      symbols,
      status,
      file,
      description: description.trim() || undefined,
      underlyings: underlyings.trim() || undefined,
      risk: risk.trim() || undefined,
      liquidity: liquidity.trim() || undefined,
      reporting: reporting.trim() || undefined,
      nav_perf: navPerf.trim() || undefined,
      mgmt_fee: parseFeePercent(mgmtFee),
      incentive_fee: parseFeePercent(incentiveFee),
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`;
    return `${bytes} B`;
  };

  return (
    <Modal
      title="New model"
      subtitle="Define a trading strategy. Create it live, or save it as a draft to finish later."
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto flex items-center gap-[7px] text-[12.5px] text-secondary">
            {file ? <FileText size={14} strokeWidth={2} /> : <Clock size={14} strokeWidth={2} />}
            {file ? (
              <>Material attached as <b className="text-on-surface">v1</b></>
            ) : (
              <>A live model requires at least one material publish</>
            )}
          </span>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" icon={Clock} disabled={!valid} onClick={() => submit("draft")}>
            Save as draft
          </Button>
          <Button icon={Check} disabled={!canPublish} onClick={() => submit("live")}>Create model</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <div style={{ gridColumn: "1 / -1" }}>
          <CreateField label="Model name" value={name} onChange={setName} placeholder="e.g. Model E — Global Macro" />
        </div>
        <CreateField label="Category" value={category} onChange={setCategory} />
        <CreateField
          label="Model size"
          value={size ? fmtMoney(Number(size)) : ""}
          placeholder="$40,000,000"
          inputMode="numeric"
          onChange={(v) => setSize(v.replace(/[^0-9]/g, ""))}
        />
        <CreateField
          label="Mgmt Fee %"
          value={mgmtFee}
          onChange={setMgmtFee}
          placeholder="e.g. 2.0"
          inputMode="decimal"
        />
        <CreateField
          label="Incentive Fee %"
          value={incentiveFee}
          onChange={setIncentiveFee}
          placeholder="e.g. 20.0"
          inputMode="decimal"
        />

        <div style={{ gridColumn: "1 / -1" }}>
          {/* NOTE: wrapping element is a <div>, not <label>. A <label> with
              no `htmlFor` delegates blank-area clicks to its first
              interactive descendant — here, the first pill's X-remove
              button — causing the first symbol to vanish on stray clicks. */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">Symbols</span>
            <div className="flex min-h-10 flex-wrap items-center gap-2 rounded border border-outline-variant bg-white px-3 py-1.5">
              <Ticks symbols={symbols} onRemove={(s) => setSymbols((xs) => xs.filter((x) => x !== s))} />
              {addingSym ? (
                <input
                  autoFocus
                  value={draftSym}
                  onChange={(e) => setDraftSym(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); commitSym(); }
                    if (e.key === "Escape") { setAddingSym(false); setDraftSym(""); }
                  }}
                  onBlur={commitSym}
                  placeholder="e.g. NVDA"
                  className="h-7 w-[110px] rounded border border-outline-variant bg-white px-2 text-[12px] font-bold uppercase text-on-surface outline-none focus:border-primary"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingSym(true)}
                  className="cursor-pointer text-[13.5px] text-secondary transition-colors hover:text-primary"
                >
                  + add symbol
                </button>
              )}
            </div>
          </div>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <CreateTextArea label="Description" value={description} onChange={setDescription} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <CreateTextArea label="Traded Underlyings" value={underlyings} onChange={setUnderlyings} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <CreateTextArea label="Leverage and Risk" value={risk} onChange={setRisk} />
        </div>
        <CreateField label="Liquidity" value={liquidity} onChange={setLiquidity} placeholder="e.g. Daily" />
        <CreateField label="Reporting" value={reporting} onChange={setReporting} placeholder="e.g. Monthly" />
        <CreateField label="NAV and Performance" value={navPerf} onChange={setNavPerf} placeholder="e.g. Monthly" />
        <CreateField label="Allotment & Redemption Process" value={subscriptionRedemption} onChange={setSubscriptionRedemption} placeholder="e.g. 15 days prior EoM"/>
        <div style={{ gridColumn: "1 / -1" }}>
          <span className="flex items-center gap-[7px] text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">
            Marketing material
            <span className="font-semibold normal-case tracking-normal text-secondary">· required to publish live</span>
          </span>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              // allow re-selecting the same file later
              e.target.value = "";
            }}
          />
          {file ? (
            <div className="mt-1.5 flex items-center gap-3 rounded-[10px] border border-outline-variant bg-surface-low p-3">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] bg-primary-fixed text-primary">
                <FileText size={18} strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-bold">{file.name}</div>
                <div className="mt-0.5 text-[12px] text-secondary">{formatFileSize(file.size)} · attaches as <b className="text-primary">v1</b> on save</div>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                aria-label="Remove material"
                className="flex h-[30px] w-[30px] flex-none cursor-pointer items-center justify-center rounded text-secondary hover:text-on-surface"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="mt-1.5 flex cursor-pointer flex-col items-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed border-outline px-3.5 py-4 text-center"
            >
              <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] bg-primary-fixed text-primary">
                <Upload size={19} strokeWidth={1.75} />
              </span>
              <div className="text-[13.5px] font-bold">Click to browse for a fact sheet or deck</div>
              <div className="text-[12px] text-secondary">Saved as <b>v1</b> · required to publish a live model</div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
