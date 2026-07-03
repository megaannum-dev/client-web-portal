"use client";

import { useState } from "react";
import { History, Check } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Modal, Ticks } from "@/components/pc/Shared";
import { fmtMoney } from "@/lib/pc/format";
import type { Model } from "@/lib/pc/types";
import { updateModel as updateModelAction } from "@/app/(roles)/pc/model-management/actions";
import { CreateField, CreateTextArea, parseFeePercent } from "./CreateModelForm";

/* ---- Edit-model form ---------------------------------------
   Sends a PATCH /api/pc/models/{id} with only the fields the user
   changed (the diff). `mgmt_fee` / `incentive_fee` are optional
   per-model overrides (null => the hardcoded 2 % / 20 % default from
   `lib/pc/models.ts` applies); they are stored on the SAME
   whole-number percentage scale as `Model.mgmt` / `Model.incentive`. */
export function EditModelForm({
  model,
  onClose,
  onSaved,
}: {
  model: Model;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(model.name);
  const [category, setCategory] = useState<string>(model.category ?? "");
  const [subscriptionRedemption, setSubscriptionRedemption] = useState<string>(model.subscription_redemption ?? "");
  const [size, setSize] = useState(String(model.size || ""));
  const [symbols, setSymbols] = useState<string[]>(model.symbols);
  const [addingSym, setAddingSym] = useState(false);
  const [draftSym, setDraftSym] = useState("");
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState(model.description ?? "");
  const [underlyings, setUnderlyings] = useState(model.underlyings ?? "");
  const [risk, setRisk] = useState(model.risk ?? "");
  const [liquidity, setLiquidity] = useState(model.liquidity ?? "");
  const [reporting, setReporting] = useState(model.reporting ?? "");
  const [navPerf, setNavPerf] = useState(model.nav_perf ?? "");
  const [mgmtFee, setMgmtFee] = useState(model.mgmt_fee != null ? String(model.mgmt_fee) : "");
  const [incentiveFee, setIncentiveFee] = useState(model.incentive_fee != null ? String(model.incentive_fee) : "");

  const commitSym = () => {
    const s = draftSym.trim().toUpperCase();
    if (s && !symbols.includes(s)) setSymbols((xs) => [...xs, s]);
    setDraftSym("");
    setAddingSym(false);
  };

  // Only send fields the user actually changed.
  const buildPatch = (): Record<string, unknown> => {
    const patch: Record<string, unknown> = {};
    const trimmed = name.trim();
    if (trimmed !== model.name) patch.name = trimmed;
    const nextCategory = category || null;
    if (nextCategory !== model.category) patch.category = nextCategory;
    const nextSR = subscriptionRedemption || null;
    if (nextSR !== model.subscription_redemption) patch.subscription_redemption = nextSR;
    const numSize = Number(size) || 0;
    if (numSize !== model.size) patch.model_size = numSize;
    if (JSON.stringify(symbols) !== JSON.stringify(model.symbols)) patch.symbols = symbols;

    const trimmedDescription = description.trim();
    if (trimmedDescription !== (model.description ?? "")) {
      patch.description = trimmedDescription === "" ? null : trimmedDescription;
    }
    const trimmedUnderlyings = underlyings.trim();
    if (trimmedUnderlyings !== (model.underlyings ?? "")) {
      patch.underlyings = trimmedUnderlyings === "" ? null : trimmedUnderlyings;
    }
    const trimmedRisk = risk.trim();
    if (trimmedRisk !== (model.risk ?? "")) {
      patch.risk = trimmedRisk === "" ? null : trimmedRisk;
    }
    const trimmedLiquidity = liquidity.trim();
    if (trimmedLiquidity !== (model.liquidity ?? "")) {
      patch.liquidity = trimmedLiquidity === "" ? null : trimmedLiquidity;
    }
    const trimmedReporting = reporting.trim();
    if (trimmedReporting !== (model.reporting ?? "")) {
      patch.reporting = trimmedReporting === "" ? null : trimmedReporting;
    }
    const trimmedNavPerf = navPerf.trim();
    if (trimmedNavPerf !== (model.nav_perf ?? "")) {
      patch.nav_perf = trimmedNavPerf === "" ? null : trimmedNavPerf;
    }
    const mgmtFeeNum = parseFeePercent(mgmtFee);
    if (mgmtFeeNum !== (model.mgmt_fee ?? null)) patch.mgmt_fee = mgmtFeeNum;
    const incentiveFeeNum = parseFeePercent(incentiveFee);
    if (incentiveFeeNum !== (model.incentive_fee ?? null)) patch.incentive_fee = incentiveFeeNum;

    return patch;
  };

  const save = () => {
    if (!name.trim() || saving) return;
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    void (async () => {
      const result = await updateModelAction(model.id, patch);
      setSaving(false);
      if (result.success) {
        onSaved();
        onClose();
      } else {
        alert(`Could not save changes: ${result.error}`);
      }
    })();
  };

  return (
    <Modal
      title={`Edit ${model.name}`}
      subtitle="Amend the strategy. Changes are versioned and appended to the model’s change history."
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto flex items-center gap-[7px] text-[12.5px] text-secondary">
            <History size={14} strokeWidth={2} />Changes are logged to the model&rsquo;s history
          </span>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={Check} disabled={!name.trim() || saving} onClick={save}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <div style={{ gridColumn: "1 / -1" }}>
          <CreateField label="Model name" value={name} onChange={setName} />
        </div>
        <CreateField label="Category" value={category} onChange={setCategory} />
        <CreateField label="Subscription / Redemption" value={subscriptionRedemption} onChange={setSubscriptionRedemption} />
        <CreateField
          label="Model size"
          value={size ? fmtMoney(Number(size)) : ""}
          placeholder="$40,000,000"
          inputMode="numeric"
          onChange={(v) => setSize(v.replace(/[^0-9]/g, ""))}
        />
        <div style={{ gridColumn: "1 / -1" }}>
          {/* See CreateModelForm: a wrapping <label> would relay blank-area
              clicks to the first pill's X-button and drop the first symbol. */}
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
      </div>
    </Modal>
  );
}
