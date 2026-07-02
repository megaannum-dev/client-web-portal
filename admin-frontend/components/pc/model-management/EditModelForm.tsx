"use client";

import { useState } from "react";
import { History, Check } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Modal, Ticks } from "@/components/pc/Shared";
import { fmtMoney } from "@/lib/pc/format";
import type { Model } from "@/lib/pc/types";
import { updateModel as updateModelAction } from "@/app/(roles)/pc/model-management/actions";
import { CreateField, MANAGER_OPTIONS } from "./CreateModelForm";

/* ---- Edit-model form ---------------------------------------
   Sends a PATCH /api/pc/models/{id} with only the fields the user
   changed (the diff). Fees are not editable here — they are not
   stored on the model (hardcoded 2 % / 20 %). */
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
  const [manager, setManager] = useState(model.manager || MANAGER_OPTIONS[0]);
  const [size, setSize] = useState(String(model.size || ""));
  const [symbols, setSymbols] = useState<string[]>(model.symbols);
  const [addingSym, setAddingSym] = useState(false);
  const [draftSym, setDraftSym] = useState("");
  const [saving, setSaving] = useState(false);

  const commitSym = () => {
    const s = draftSym.trim().toUpperCase();
    if (s && !symbols.includes(s)) setSymbols((xs) => [...xs, s]);
    setDraftSym("");
    setAddingSym(false);
  };

  const managerOptions = MANAGER_OPTIONS.includes(manager)
    ? MANAGER_OPTIONS
    : [manager, ...MANAGER_OPTIONS];

  // Only send fields the user actually changed.
  const buildPatch = (): Record<string, unknown> => {
    const patch: Record<string, unknown> = {};
    const trimmed = name.trim();
    if (trimmed !== model.name) patch.name = trimmed;
    if (manager !== model.manager) patch.manager = manager;
    const numSize = Number(size) || 0;
    if (numSize !== model.size) patch.model_size = numSize;
    if (JSON.stringify(symbols) !== JSON.stringify(model.symbols)) patch.symbols = symbols;
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
        <CreateField label="Manager" value={manager} onChange={setManager} select options={managerOptions} />
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
      </div>
    </Modal>
  );
}
