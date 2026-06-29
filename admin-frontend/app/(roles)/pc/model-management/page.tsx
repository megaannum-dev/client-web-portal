"use client";

/* ============================================================
   PC — Model Management (hi-fi screen)

   Card grid (default, 3 cols) + table layout alternate, controlled
   by the in-page grid/table ViewToggle. Slide-in per-model detail
   (Overview · Materials · Changes), New-model / Edit panel, and a fee
   calculator opened from the header.

   DATA: consumed ONLY through the seam (loadModels / fmtMoney /
   computeFees). Forms are display-only, matching the prototype.
   Shared primitives (Eyebrow, StatusChip, Ticks, VerBadge, Modal,
   Fact, FeeCalc) and ui/* (Button, Chip) are reused, never re-created.
   Ported faithfully from the design prototype (ModelManagement.jsx).
   ============================================================ */

import { useState, useEffect } from "react";
import {
  LayoutGrid, List, Calculator, Plus, Pencil, Copy, Upload, Download,
  FileText, File, Eye, Check, History, Clock, ChevronDown, X, Rocket, Trash2,
} from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import {
  Eyebrow, StatusChip, Ticks, VerBadge, Modal, Fact, FeeCalc,
} from "@/components/pc/Shared";
import { fmtMoney, mapDtoToModel } from "@/lib/pc/models";
import { renderChange } from "@/lib/pc/change-log";
import type { ChangeEntry, Material, Model, ModelChangeKind, ModelStatus } from "@/lib/pc/types";
import { useModels } from "@/hooks/api/useModels";
import {
  createModel as createModelAction,
  publishModel as publishModelAction,
} from "@/app/(roles)/pc/model-management/action";

/* Today as an ISO date (YYYY-MM-DD) — matches the change-history /
   material date format used throughout the model book. */
const isoToday = () => new Date().toISOString().slice(0, 10);

type Layout = "grid" | "table";
type Tab = "overview" | "materials" | "changes";

/* ============================================================
   CARD GRID (default layout)
   ============================================================ */
function ModelCard({ m, onOpen }: { m: Model; onOpen: (id: string, tab: Tab) => void }) {
  return (
    <div
      onClick={() => onOpen(m.id, "overview")}
      className="flex cursor-pointer flex-col gap-3.5 rounded-lg border border-outline-variant bg-surface-lowest p-[18px] shadow-card transition-shadow duration-150 hover:shadow-hover"
    >
      <div className="flex items-start justify-between gap-2.5">
        <div>
          <div className="text-[18px] font-bold tracking-[-0.01em] text-on-surface">{m.name}</div>
          <div className="mt-[3px] text-[13px] text-secondary">{m.manager}</div>
        </div>
        <StatusChip status={m.status} />
      </div>
      <div className="text-[24px] font-bold tracking-[-0.02em] tabular-nums text-on-surface">
        {fmtMoney(m.size)}
      </div>
      <div className="flex gap-2">
        <Chip tone="warm" dot={false}>Mgmt {m.mgmt}%</Chip>
        <Chip tone="neutral" dot={false}>Incentive {m.incentive}%</Chip>
      </div>
      <Ticks symbols={m.symbols} />
      <div className="flex items-center justify-end gap-2.5 border-t border-outline-variant pt-[13px]">
        <VerBadge version={m.version} none={m.status === "draft"} />
      </div>
    </div>
  );
}

function CardGrid({ models, onOpen }: { models: Model[]; onOpen: (id: string, tab: Tab) => void }) {
  return (
    <div className="grid grid-cols-3 gap-[18px]">
      {models.map((m) => <ModelCard key={m.id} m={m} onOpen={onOpen} />)}
    </div>
  );
}

/* ============================================================
   TABLE LAYOUT
   ============================================================ */
const TH_BASE =
  "bg-surface-low px-3.5 py-3 text-[11px] font-bold uppercase tracking-[0.05em] text-secondary whitespace-nowrap";

function ModelTr({ m, onOpen }: { m: Model; onOpen: (id: string, tab: Tab) => void }) {
  const [hover, setHover] = useState(false);
  const td = `border-t border-outline-variant px-3.5 py-3.5 text-[14px] align-middle ${hover ? "bg-surface-low" : ""}`;
  return (
    <tr
      onClick={() => onOpen(m.id, "overview")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="cursor-pointer"
    >
      <td className={td}>
        <div className="font-bold">{m.name}</div>
        <div className="mt-1"><StatusChip status={m.status} /></div>
      </td>
      <td className={`${td} text-right font-bold tabular-nums`}>{fmtMoney(m.size)}</td>
      <td className={`${td} text-secondary`}>{m.manager}</td>
      <td className={`${td} whitespace-nowrap text-secondary`}>{m.intro}</td>
      <td className={td}><Ticks symbols={m.symbols} /></td>
      <td className={`${td} text-right font-bold tabular-nums`}>{m.mgmt}%</td>
      <td className={`${td} text-right font-bold tabular-nums`}>{m.incentive}%</td>
      <td className={td}>
        <span
          onClick={(e) => { e.stopPropagation(); onOpen(m.id, "materials"); }}
          className="inline-flex cursor-pointer items-center gap-[5px] font-bold text-primary"
        >
          <Eye size={14} strokeWidth={2} />View
        </span>
      </td>
      <td className={`${td} whitespace-nowrap text-right`}>
        {m.status === "draft" ? (
          <span className="inline-flex items-center gap-[5px] font-bold text-primary">
            <Upload size={13} strokeWidth={2} />Upload v1
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded bg-primary px-[11px] py-1.5 text-[12.5px] font-semibold text-white">
            <Download size={13} strokeWidth={2} />Download {m.version}
          </span>
        )}
      </td>
    </tr>
  );
}

function ModelTable({ models, onOpen }: { models: Model[]; onOpen: (id: string, tab: Tab) => void }) {
  const headers = ["Model", "Model size", "Manager", "Intro", "Symbols", "Mgmt %", "Incentive %", "Materials", "Latest"];
  return (
    <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={h} className={`${TH_BASE} ${i === 1 || i === 5 || i === 6 || i === 8 ? "text-right" : "text-left"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((m) => <ModelTr key={m.id} m={m} onOpen={onOpen} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================
   SLIDE-IN DETAIL  (Overview · Materials · Changes)
   ============================================================ */
function FactGrid({ m, onEdit }: { m: Model; onEdit: (id: string) => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-[11px]">
        <Fact label="Model size" value={fmtMoney(m.size)} />
        <Fact label="Manager" value={m.manager} />
        <Fact label="Mgmt fee" value={`${m.mgmt}%`} />
        <Fact label="Incentive fee" value={`${m.incentive}%`} />
        <div className="rounded-[10px] bg-surface-low px-[13px] py-[11px]" style={{ gridColumn: "1 / -1" }}>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary">Symbols</div>
          <div className="mt-2"><Ticks symbols={m.symbols} /></div>
        </div>
        <Fact label="Introduced" value={m.intro} span />
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" icon={Pencil} onClick={() => onEdit(m.id)}>Edit model</Button>
        <Button variant="secondary" icon={Copy}>Duplicate</Button>
      </div>
    </>
  );
}

function MaterialsTab({ m, staged }: { m: Model; staged?: boolean }) {
  if (m.status === "draft" && !staged) {
    return (
      <div className="flex flex-col items-center gap-2.5 rounded-md border-[1.5px] border-dashed border-outline px-[18px] py-7 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary-fixed text-primary">
          <Upload size={22} strokeWidth={1.75} />
        </span>
        <div className="text-[15px] font-bold">No materials yet</div>
        <div className="max-w-[280px] text-[13px] text-secondary">
          Drag a fact sheet or deck here, or browse — it saves as <b>v1</b>.
        </div>
        <Button icon={Upload} className="mt-1">Upload v1</Button>
      </div>
    );
  }
  const nextVer = m.materials.length + 1;
  return (
    <>
      {staged ? (
        <div className="rounded-md border border-outline-variant bg-surface-low p-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] bg-primary-fixed text-primary">
              <File size={18} strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-bold">{m.name.replace(" ", "")}_Marketing_v{nextVer}.pdf</div>
              <div className="mt-0.5 text-[12px] text-secondary">2.6 MB · staged · saves as <b className="text-primary">v{nextVer}</b></div>
            </div>
            <Button icon={Check} className="flex-none">Confirm</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-md border-[1.5px] border-dashed border-outline px-4 py-5 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-primary-fixed text-primary">
            <Upload size={20} strokeWidth={1.75} />
          </span>
          <div className="text-[14px] font-bold">Upload new version</div>
          <div className="text-[12.5px] text-secondary">New file saves as <b>v{nextVer}</b> and logs a change.</div>
        </div>
      )}
      <Eyebrow className="mb-2 mt-[18px]">Stored files</Eyebrow>
      <div>
        {m.materials.map((f, i) => (
          <div
            key={f.file}
            className={`flex items-center gap-3 px-0.5 py-3 ${i ? "border-t border-outline-variant" : ""}`}
          >
            <span
              className={`flex h-8 w-8 flex-none items-center justify-center rounded ${
                i === 0 ? "bg-primary-fixed text-primary" : "bg-surface-container text-secondary"
              }`}
            >
              <FileText size={16} strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-[7px] text-[13.5px] font-bold">
                {f.file}
                {i === 0 && (
                  <span className="rounded-[6px] bg-primary-fixed px-[7px] py-0.5 text-[11px] font-bold text-primary">latest</span>
                )}
              </div>
              <div className="mt-0.5 text-[12px] text-secondary">{f.ver} · {f.date} · {f.size}</div>
            </div>
            <Button variant="secondary" icon={Download} className="flex-none px-3 py-[7px]">Download</Button>
          </div>
        ))}
      </div>
    </>
  );
}

function ChangesTab({ m }: { m: Model }) {
  if (!m.changes.length) {
    return <div className="py-[30px] text-center text-[13.5px] text-secondary">No changes recorded yet.</div>;
  }
  return (
    <div className="relative pl-[18px]">
      <span className="absolute left-1 top-1 bottom-2 w-[1.5px] bg-outline-variant" />
      {m.changes.map((c, i) => (
        <div key={`${c.date}-${i}`} className="relative" style={{ paddingBottom: i < m.changes.length - 1 ? 16 : 0 }}>
          <span
            className="absolute left-[-18px] top-[3px] h-[9px] w-[9px] rounded-full"
            style={{
              background: i === 0 ? "rgb(var(--color-primary))" : "rgb(var(--color-surface-highest))",
              border: `1.5px solid ${i === 0 ? "rgb(var(--color-primary))" : "rgb(var(--color-outline))"}`,
            }}
          />
          <div className="text-[13.5px] font-bold text-on-surface">{renderChange(c)}</div>
          <div className="mt-0.5 text-[12.5px] text-secondary">
            {c.date} · {c.user} · <span className="font-bold text-primary">{c.ver}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ModelDetailPanel({
  m, tab, staged, onTab, onClose, onEdit, onPublish, onDelete,
}: {
  m: Model;
  tab: Tab;
  staged?: boolean;
  onTab: (t: Tab) => void;
  onClose: () => void;
  onEdit: (id: string) => void;
  onPublish: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const TABS: [Tab, string][] = [["overview", "Overview"], ["materials", "Materials"], ["changes", "Changes"]];
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <>
      <div onClick={onClose} className="absolute inset-0 z-[8]" style={{ background: "rgba(40,38,34,0.18)" }} />
      <div
        className="absolute bottom-[18px] right-[18px] top-[18px] z-[9] flex w-[432px] flex-col overflow-hidden rounded-[18px] border border-outline-variant bg-surface-lowest shadow-overlay"
        style={{ maxWidth: "calc(100% - 36px)" }}
      >
        <div className="flex-none border-b border-outline-variant px-[22px] pb-3.5 pt-[18px]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[20px] font-bold tracking-[-0.01em]">{m.name}</div>
              <div className="mt-1 text-[13px] text-secondary">{m.manager} · {fmtMoney(m.size)}</div>
            </div>
            <div className="flex flex-none items-center gap-2.5">
              <StatusChip status={m.status} />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex cursor-pointer p-[3px] text-secondary"
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-none gap-1 border-b border-outline-variant px-4">
          {TABS.map(([t, l]) => (
            <button
              key={t}
              type="button"
              onClick={() => onTab(t)}
              className={`relative cursor-pointer border-none bg-transparent px-3 pb-3.5 pt-3 text-[13.5px] font-bold ${
                t === tab ? "text-on-surface" : "text-secondary"
              }`}
            >
              {l}
              {t === tab && <span className="absolute bottom-[-1px] left-[9px] right-[9px] h-[3px] rounded-sm bg-primary" />}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-[22px] py-5">
          {tab === "materials" ? (
            <MaterialsTab m={m} staged={staged} />
          ) : tab === "changes" ? (
            <ChangesTab m={m} />
          ) : (
            <FactGrid m={m} onEdit={onEdit} />
          )}
        </div>
        {m.status === "draft" && (
          <div className="flex flex-none justify-end items-center gap-3 border-t border-outline-variant bg-surface-low px-[22px] py-[13px]">
            {confirmDelete ? (
              <>
                <span className="mr-auto flex items-center gap-[7px] text-[12.5px] text-error">
                  <Trash2 size={14} strokeWidth={2} />Delete this draft? This can&rsquo;t be undone.
                </span>
                <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <Button
                  icon={Trash2}
                  onClick={() => onDelete(m.id)}
                  className="border-transparent bg-error text-white hover:bg-[#93000a]"
                >
                  Delete draft
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  icon={Trash2}
                  onClick={() => setConfirmDelete(true)}
                  className="text-error hover:bg-[rgba(186,26,26,0.08)] hover:text-error"
                >
                  Delete draft
                </Button>
                <Button icon={Rocket} onClick={() => onPublish(m.id)}>Publish to live</Button>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/* ============================================================
   MODALS — create / edit model · fee calculator
   ============================================================ */
const MANAGER_OPTIONS = ["Wilson Capital", "Brookfield Advisors", "Sequoia Partners"];

/* A labelled form field. Read-only (display div) by default — that is
   the Edit-model path, which stays display-only as in the prototype.
   When `onChange` is supplied it renders a live <input> / <select>,
   used by the New-model form. */
function CreateField({
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

/* ---- New-model form (create live or draft) ----------------- */
function CreateModelForm({ onClose, onCreate }: { onClose: () => void; onCreate: (m: Model) => void }) {
  const [name, setName] = useState("");
  const [manager, setManager] = useState(MANAGER_OPTIONS[0]);
  const [size, setSize] = useState("");            // raw digits
  const [symbols, setSymbols] = useState<string[]>(["SPY", "QQQ", "IWM"]);
  const [mgmt, setMgmt] = useState("0.85");
  const [incentive, setIncentive] = useState("15");
  const [material, setMaterial] = useState<string | null>(null);
  const [addingSym, setAddingSym] = useState(false);
  const [draftSym, setDraftSym] = useState("");

  const commitSym = () => {
    const s = draftSym.trim().toUpperCase();
    if (s && !symbols.includes(s)) setSymbols((xs) => [...xs, s]);
    setDraftSym("");
    setAddingSym(false);
  };

  const valid = name.trim().length > 0;

  const build = (status: ModelStatus): Model => {
    const today = isoToday();
    const hasMaterial = !!material;
    const version = hasMaterial ? "v1" : "—";
    const materials: Material[] = hasMaterial
      ? [{ file: material!, ver: "v1", date: today, size: "2.6 MB" }]
      : [];
    const changes: ChangeEntry[] = [
      {
        kind: "created" as ModelChangeKind,
        detail: { status },
        user: "You",
        ver: version,
        date: today,
      },
      ...(hasMaterial
        ? [{
            kind: "material_uploaded" as ModelChangeKind,
            detail: { filename: material!, version: "v1" },
            user: "You",
            ver: "v1",
            date: today,
          }]
        : []),
    ];
    return {
      id: `m_${Date.now().toString(36)}`,
      name: name.trim(),
      size: Number(size) || 0,
      manager,
      intro: "—",
      symbols,
      mgmt: parseFloat(mgmt) || 0,
      incentive: parseFloat(incentive) || 0,
      status,
      version,
      materials,
      changes,
    };
  };

  const submit = (status: ModelStatus) => {
    if (!valid) return;
    onCreate(build(status));
  };

  return (
    <Modal
      title="New model"
      subtitle="Define a trading strategy. Create it live, or save it as a draft to finish later."
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto flex items-center gap-[7px] text-[12.5px] text-secondary">
            {material ? <FileText size={14} strokeWidth={2} /> : <Clock size={14} strokeWidth={2} />}
            {material ? (
              <>Material attaches as <b className="text-on-surface">v1</b> either way</>
            ) : (
              <>Drafts and live models both keep any material you add</>
            )}
          </span>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" icon={Clock} disabled={!valid} onClick={() => submit("draft")}>
            Save as draft
          </Button>
          <Button icon={Check} disabled={!valid} onClick={() => submit("live")}>Create model</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <div style={{ gridColumn: "1 / -1" }}>
          <CreateField label="Model name" value={name} onChange={setName} placeholder="e.g. Model E — Global Macro" />
        </div>
        <CreateField label="Manager" value={manager} onChange={setManager} select options={MANAGER_OPTIONS} />
        <CreateField
          label="Notional size (AUM)"
          value={size ? fmtMoney(Number(size)) : ""}
          placeholder="$40,000,000"
          inputMode="numeric"
          onChange={(v) => setSize(v.replace(/[^0-9]/g, ""))}
        />
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">Symbol universe</span>
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
          </label>
        </div>
        <CreateField label="Standard mgmt fee (%)" value={mgmt} onChange={setMgmt} placeholder="0.85" inputMode="decimal" />
        <CreateField label="Standard incentive fee (%)" value={incentive} onChange={setIncentive} placeholder="15" inputMode="decimal" />
        <div style={{ gridColumn: "1 / -1" }}>
          <span className="flex items-center gap-[7px] text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">
            Marketing material
            <span className="font-semibold normal-case tracking-normal text-secondary">· optional</span>
          </span>
          {material ? (
            <div className="mt-1.5 flex items-center gap-3 rounded-[10px] border border-outline-variant bg-surface-low p-3">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] bg-primary-fixed text-primary">
                <FileText size={18} strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-bold">{material}</div>
                <div className="mt-0.5 text-[12px] text-secondary">2.6 MB · attaches as <b className="text-primary">v1</b> on save</div>
              </div>
              <button
                type="button"
                onClick={() => setMaterial(null)}
                aria-label="Remove material"
                className="flex h-[30px] w-[30px] flex-none cursor-pointer items-center justify-center rounded text-secondary hover:text-on-surface"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
          ) : (
            <div
              onClick={() => setMaterial("Model_Marketing_v1.pdf")}
              className="mt-1.5 flex cursor-pointer flex-col items-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed border-outline px-3.5 py-4 text-center"
            >
              <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] bg-primary-fixed text-primary">
                <Upload size={19} strokeWidth={1.75} />
              </span>
              <div className="text-[13.5px] font-bold">Drop a fact sheet or deck, or browse</div>
              <div className="text-[12px] text-secondary">Saved as <b>v1</b> · kept whether you create live or save as draft</div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ---- Edit-model form (display-only, as in the prototype) --- */
function EditModelForm({ model, onClose }: { model: Model; onClose: () => void }) {
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
          <Button icon={Check} onClick={onClose}>Save changes</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <div style={{ gridColumn: "1 / -1" }}>
          <CreateField label="Model name" value={model.name} />
        </div>
        <CreateField label="Manager" value={model.manager} select />
        <CreateField label="Model size" value={fmtMoney(model.size)} />
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">Symbols</span>
            <div className="flex min-h-10 flex-wrap items-center gap-2 rounded border border-outline-variant bg-white px-3 py-1.5">
              <Ticks symbols={model.symbols} />
              <span className="text-[13.5px] text-secondary">+ add symbol</span>
            </div>
          </label>
        </div>
        <CreateField label="Standard mgmt fee (%)" value={String(model.mgmt)} />
        <CreateField label="Standard incentive fee (%)" value={String(model.incentive)} />
      </div>
    </Modal>
  );
}

function CalcModal({ models, onClose }: { models: Model[]; onClose: () => void }) {
  return (
    <Modal title="Fee reference" subtitle="Estimate the management and incentive fees for a model." onClose={onClose} width={520} centered>
      <FeeCalc models={models} />
    </Modal>
  );
}

/* ============================================================
   PAGE
   ============================================================ */
export default function ModelManagementPage() {
  const { data: remoteModels, refetch } = useModels();
  const [models, setModels] = useState<Model[]>([]);
  useEffect(() => { if (remoteModels) setModels(remoteModels); }, [remoteModels]);

  const [layout, setLayout] = useState<Layout>("grid");
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [creating, setCreating] = useState(false);
  const [calc, setCalc] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const open = (id: string, t: Tab) => { setOpenId(id); setTab(t || "overview"); };

  // Optimistically prepend, then swap in the server-assigned model once API responds.
  const handleCreate = (model: Model) => {
    setModels((ms) => [model, ...ms]);
    setCreating(false);
    open(model.id, "overview");
    void (async () => {
      try {
        const result = await createModelAction({
          name: model.name, model_size: model.size, manager: model.manager,
          symbols: model.symbols, mgmt_fee: model.mgmt, incentive_fee: model.incentive,
          status: model.status,
        });
        if (result.success) {
          const serverModel = mapDtoToModel(result.data);
          setModels((ms) => ms.map((m) => (m.id === model.id ? serverModel : m)));
          setOpenId((id) => (id === model.id ? serverModel.id : id));
        }
      } catch { /* keep optimistic model */ }
    })();
  };

  // Optimistic publish flip; confirmed via API then refetched.
  const handlePublish = (id: string) => {
    setModels((ms) =>
      ms.map((m) => {
        if (m.id !== id || m.status !== "draft") return m;
        const version = m.materials[0]?.ver ?? m.version;
        const entry: ChangeEntry = {
          kind: "published",
          detail: {},
          user: "You",
          ver: version,
          date: isoToday(),
        };
        return { ...m, status: "live", version, changes: [entry, ...m.changes] };
      }),
    );
    void (async () => {
      try { await publishModelAction(id); refetch(); } catch { /* keep optimistic state */ }
    })();
  };

  // Delete a draft model — drafts only; closes the panel.
  const handleDelete = (id: string) => {
    setModels((ms) => ms.filter((x) => !(x.id === id && x.status === "draft")));
    setOpenId(null);
  };
  const m = models.find((x) => x.id === openId);
  const editModel = editId ? models.find((x) => x.id === editId) : undefined;
  const draftCount = models.filter((x) => x.status === "draft").length;

  const TOGGLES: [Layout, typeof LayoutGrid, string][] = [
    ["grid", LayoutGrid, "Card view"],
    ["table", List, "Table view"],
  ];

  return (
    // Full-bleed work surface: negative margins cancel <main>'s p-8 px-16 so
    // the relative root (and every absolute inset-0 backdrop + the docked
    // detail panel) covers the entire content area, padding included. The
    // inner wrapper re-applies that padding so content stays put. min-h fills
    // the shell content area (viewport − 64px header).
    <div className="relative -mx-16 -my-8 min-h-[calc(100vh_-_64px)]">
      <div className="px-16 py-8">
        <div className="mb-[26px] flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-on-surface">Model Management</h1>
            <p className="mt-1.5 text-[15px] text-secondary">
              Create and manage the firm&rsquo;s trading strategies · {models.length} models · {draftCount} draft
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex overflow-hidden rounded border border-outline">
              {TOGGLES.map(([k, IconCmp, title]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setLayout(k)}
                  title={title}
                  className={`flex cursor-pointer items-center border-none px-[11px] py-2 transition-all duration-150 ${
                    layout === k ? "bg-primary text-white" : "bg-white text-secondary"
                  }`}
                >
                  <IconCmp size={17} strokeWidth={1.9} />
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              icon={Calculator}
              onClick={() => setCalc(true)}
              title="Fee calculator"
              aria-label="Fee calculator"
              className="px-[13px] py-2.5"
            />
            <Button icon={Plus} onClick={() => setCreating(true)}>New model</Button>
          </div>
        </div>

        {layout === "grid"
          ? <CardGrid models={models} onOpen={open} />
          : <ModelTable models={models} onOpen={open} />}
      </div>

      {m && (
        <ModelDetailPanel
          m={m}
          tab={tab}
          onTab={setTab}
          onClose={() => setOpenId(null)}
          onEdit={(id) => setEditId(id)}
          onPublish={handlePublish}
          onDelete={handleDelete}
        />
      )}
      {creating && <CreateModelForm onClose={() => setCreating(false)} onCreate={handleCreate} />}
      {editModel && <EditModelForm model={editModel} onClose={() => setEditId(null)} />}
      {calc && <CalcModal models={models} onClose={() => setCalc(false)} />}
    </div>
  );
}
