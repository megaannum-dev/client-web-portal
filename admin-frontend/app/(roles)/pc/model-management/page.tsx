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

import { useState, useEffect, useRef } from "react";
import {
  LayoutGrid, List, Calculator, Plus, Pencil, Copy, Upload, Download,
  FileText, File, Eye, Check, History, Clock, ChevronDown, X, Rocket, Trash2,
} from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import {
  Eyebrow, StatusChip, Ticks, VerBadge, Modal, Fact, FeeCalc,
} from "@/components/pc/Shared";
import { fmtMoney, mapDtoToModel, mapDtoToMaterial } from "@/lib/pc/models";
import { renderChange } from "@/lib/pc/change-log";
import type { ChangeEntry, Material, Model, ModelChangeKind, ModelStatus } from "@/lib/pc/types";
import { useModels } from "@/hooks/api/useModels";
import {
  createModel as createModelAction,
  publishModel as publishModelAction,
  uploadMaterial as uploadMaterialAction,
  updateModel as updateModelAction,
  getMaterials as getMaterialsAction,
  downloadMaterial as downloadMaterialAction,
  deleteModel as deleteModelAction
} from "@/app/(roles)/pc/model-management/actions";

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
function FactGrid({ m, onEdit, onDuplicate }: { m: Model; onEdit: (id: string) => void; onDuplicate: (id: string) => void }) {
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
        <Button variant="secondary" icon={Copy} onClick={() => onDuplicate(m.id)}>Duplicate</Button>
      </div>
    </>
  );
}

function fmtBytes(b: number): string {
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  if (b >= 1e3) return `${Math.round(b / 1e3)} KB`;
  return `${b} B`;
}

/* MaterialsTab — three states:
   - draft + no stored materials + no staged file → "No materials yet" empty zone
   - any state with a staged file → staged card with Confirm / Cancel
   - otherwise → "Upload new version" drop zone + stored files list

   Picking a file ONLY stages it locally. The POST /materials request is
   sent on explicit Confirm — no auto-upload, no side-effect on /publish
   or PATCH /models. */
function MaterialsTab({
  m,
  materials,
  onUpload,
  onDownload,
}: {
  m: Model;
  materials: Material[];
  onUpload: (file: File) => Promise<boolean>;
  onDownload: (material: Material) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [staged, setStaged] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const pickFile = () => fileInputRef.current?.click();
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (f) setStaged(f);
  };
  const confirmUpload = async () => {
    if (!staged) return;
    setUploading(true);
    const ok = await onUpload(staged);
    setUploading(false);
    if (ok) setStaged(null);
  };

  const nextVer = materials.length + 1;

  // Staged file → confirmation card (matches design #3).
  const stagedCard = staged ? (
    <div className="rounded-md border border-outline-variant bg-surface-low p-3.5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] bg-primary-fixed text-primary">
          <File size={18} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-bold">{staged.name}</div>
          <div className="mt-0.5 text-[12px] text-secondary">
            {fmtBytes(staged.size)} · staged · saves as <b className="text-primary">v{nextVer}</b>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={() => setStaged(null)}
          disabled={uploading}
          className="flex-none px-3 py-[7px]"
        >
          Cancel
        </Button>
        <Button icon={Check} onClick={confirmUpload} disabled={uploading} className="flex-none">
          {uploading ? "Uploading…" : "Confirm"}
        </Button>
      </div>
    </div>
  ) : null;

  // Empty draft state (no stored materials and nothing staged).
  if (!staged && !materials.length && m.status === "draft") {
    return (
      <div className="flex flex-col items-center gap-2.5 rounded-md border-[1.5px] border-dashed border-outline px-[18px] py-7 text-center">
        <input ref={fileInputRef} type="file" className="hidden" onChange={onPick} />
        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary-fixed text-primary">
          <Upload size={22} strokeWidth={1.75} />
        </span>
        <div className="text-[15px] font-bold">No materials yet</div>
        <div className="max-w-[280px] text-[13px] text-secondary">
          Click to browse for a fact sheet or deck — it saves as <b>v1</b>.
        </div>
        <Button icon={Upload} className="mt-1" onClick={pickFile}>Upload v1</Button>
      </div>
    );
  }

  return (
    <>
      <input ref={fileInputRef} type="file" className="hidden" onChange={onPick} />
      {stagedCard ?? (
        <div
          onClick={pickFile}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-md border-[1.5px] border-dashed border-outline px-4 py-5 text-center"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-primary-fixed text-primary">
            <Upload size={20} strokeWidth={1.75} />
          </span>
          <div className="text-[14px] font-bold">Upload new version</div>
          <div className="text-[12.5px] text-secondary">
            New file saves as <b>v{nextVer}</b> and logs a change.
          </div>
        </div>
      )}
      {materials.length > 0 && (
        <>
          <Eyebrow className="mb-2 mt-[18px]">Stored files</Eyebrow>
          <div>
            {materials.map((f, i) => (
              <div
                key={f.id ?? `${f.file}-${f.ver}`}
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
                <Button
                  variant="secondary"
                  icon={Download}
                  className="flex-none px-3 py-[7px]"
                  onClick={() => onDownload(f)}
                >
                  Download
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
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
  m, tab, materials, onTab, onClose, onEdit, onDuplicate, onPublish, onDelete, onUploadMaterial, onDownloadMaterial,
}: {
  m: Model;
  tab: Tab;
  materials: Material[];
  onTab: (t: Tab) => void;
  onClose: () => void;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onPublish: (id: string) => void;
  onDelete: (id: string) => void;
  onUploadMaterial: (id: string, file: File) => Promise<boolean>;
  onDownloadMaterial: (modelId: string, material: Material) => void;
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
            <MaterialsTab
              m={m}
              materials={materials}
              onUpload={(file) => onUploadMaterial(m.id, file)}
              onDownload={(mat) => onDownloadMaterial(m.id, mat)}
            />
          ) : tab === "changes" ? (
            <ChangesTab m={m} />
          ) : (
            <FactGrid m={m} onEdit={onEdit} onDuplicate={onDuplicate} />
          )}
        </div>
        {m.status === "draft" && (() => {
          // Publish prerequisites mirror the backend ModelService.publish_model
          // checks (model_size > 0 and at least one material). Reasons are
          // surfaced inline so the user knows what's missing.
          const missing: string[] = [];
          if (!m.name?.trim()) missing.push("name");
          if (!m.size) missing.push("model size");
          if (!materials.length) missing.push("material");
          const canPublish = missing.length === 0;
          const missingMsg =
            missing.length === 0
              ? null
              : `Add ${missing.join(", ")} to publish`;
          return (
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
                  <Button
                    icon={Rocket}
                    disabled={!canPublish}
                    onClick={() => onPublish(m.id)}
                    title={missingMsg ?? undefined}
                  >
                    Publish to live
                  </Button>
                </>
              )}
            </div>
          );
        })()}
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

/** Build a `NewModelDraft` payload sent up to `handleCreate`. */
interface NewModelDraft {
  name: string;
  manager: string;
  size: number;
  symbols: string[];
  status: ModelStatus;
  file: File | null;
}

/* ---- New-model form (create live or draft) -----------------
   `initial` pre-fills the form (used by Duplicate). The material file is
   never copied — even on duplicate the user must attach their own. */
function CreateModelForm({
  onClose,
  onCreate,
  initial,
}: {
  onClose: () => void;
  onCreate: (m: NewModelDraft) => void;
  initial?: { name: string; manager: string; size: number; symbols: string[] };
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [manager, setManager] = useState(initial?.manager || MANAGER_OPTIONS[0]);
  const [size, setSize] = useState(initial?.size ? String(initial.size) : "");
  const [symbols, setSymbols] = useState<string[]>(initial?.symbols ?? ["SPY", "QQQ", "IWM"]);
  const [file, setFile] = useState<File | null>(null);
  const [addingSym, setAddingSym] = useState(false);
  const [draftSym, setDraftSym] = useState("");
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
      manager,
      size: Number(size) || 0,
      symbols,
      status,
      file,
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
        <CreateField label="Manager" value={manager} onChange={setManager} select options={MANAGER_OPTIONS} />
        <CreateField
          label="Model size"
          value={size ? fmtMoney(Number(size)) : ""}
          placeholder="$40,000,000"
          inputMode="numeric"
          onChange={(v) => setSize(v.replace(/[^0-9]/g, ""))}
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

/* ---- Edit-model form ---------------------------------------
   Sends a PATCH /api/pc/models/{id} with only the fields the user
   changed (the diff). Fees are not editable here — they are not
   stored on the model (hardcoded 2 % / 20 %). */
function EditModelForm({
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
  const [duplicateSeed, setDuplicateSeed] = useState<NewModelDraft | null>(null);
  // Materials per model id — fetched on detail-panel open and after each
  // confirmed upload. The list endpoint (GET /api/pc/models) does NOT
  // include materials/changes, so we hydrate them from the dedicated
  // endpoint instead of relying on the model row.
  const [materialsById, setMaterialsById] = useState<Record<string, Material[]>>({});

  // Load materials for the open model.
  useEffect(() => {
    if (!openId) return;
    let cancelled = false;
    void (async () => {
      const result = await getMaterialsAction(openId);
      if (cancelled || !result.success) return;
      // Latest first — newest materials at the top of the list.
      const mapped = result.data.map(mapDtoToMaterial).reverse();
      setMaterialsById((prev) => ({ ...prev, [openId]: mapped }));
    })();
    return () => { cancelled = true; };
  }, [openId]);

  const open = (id: string, t: Tab) => { setOpenId(id); setTab(t || "overview"); };

  // Real flow: create → upload material (if any) → publish (if user chose live).
  // We refetch from the server at the end so the UI matches DB truth.
  const handleCreate = (draft: {
    name: string;
    manager: string;
    size: number;
    symbols: string[];
    status: ModelStatus;
    file: File | null;
  }) => {
    setCreating(false);
    void (async () => {
      const created = await createModelAction({
        name: draft.name,
        model_size: draft.size,
        manager: draft.manager,
        symbols: draft.symbols,
      });
      if (!created.success) {
        alert(`Could not create model: ${created.error}`);
        return;
      }
      const newId = created.data.id;

      if (draft.file) {
        const fd = new FormData();
        fd.append("file", draft.file, draft.file.name);
        const up = await uploadMaterialAction(newId, fd);
        if (!up.success) {
          alert(`Model created, but material upload failed: ${up.error}`);
          refetch();
          return;
        }
      }

      if (draft.status === "live") {
        const pub = await publishModelAction(newId);
        if (!pub.success) {
          alert(`Model saved as draft — could not publish to live: ${pub.error}`);
          refetch();
          return;
        }
      }

      refetch();
      setOpenId(newId);
      setTab("overview");
    })();
  };

  // Publish a draft → live. Prerequisites are gated by the disabled Publish
  // button, so we just call the API and refetch on success.
  const handlePublish = (id: string) => {
    void (async () => {
      const result = await publishModelAction(id);
      if (result.success) refetch();
    })();
  };

  // Delete a draft model — drafts only; closes the panel.
  // NOTE: there is no backend DELETE endpoint yet (see chat report);
  // this is a client-only prune until the backend lands.
  const handleDelete = (id: string) => {
    void (async () => {
      const result = await deleteModelAction(id);
      if (result.success) refetch();
    })();

    setModels((ms) => ms.filter((x) => !(x.id === id && x.status === "draft")));
    setOpenId(null);
  };

  // Duplicate: close the detail panel and open New-model pre-filled.
  const handleDuplicate = (id: string) => {
    const src = models.find((x) => x.id === id);
    if (!src) return;
    setDuplicateSeed({
      name: `${src.name} (copy)`,
      manager: src.manager,
      size: src.size,
      symbols: [...src.symbols],
      status: "draft",
      file: null,
    });
    setOpenId(null);
    setCreating(true);
  };

  // Confirm a staged material upload from the detail panel. Returns true on
  // success so MaterialsTab can clear the staged file; on failure we surface
  // the backend error and leave the file staged for retry.
  const handleUploadMaterial = async (id: string, file: File): Promise<boolean> => {
    const fd = new FormData();
    fd.append("file", file, file.name);
    const result = await uploadMaterialAction(id, fd);
    if (!result.success) {
      alert(`Upload failed: ${result.error}`);
      return false;
    }
    // Re-fetch materials for this model and refresh the model list (the
    // upload bumps `version` on the model row).
    const reload = await getMaterialsAction(id);
    if (reload.success) {
      setMaterialsById((prev) => ({ ...prev, [id]: reload.data.map(mapDtoToMaterial).reverse() }));
    }
    refetch();
    return true;
  };

  // Stream the file through the server action (auth cookie can't ride on a
  // plain <a href>), then synthesize a blob URL and trigger a save dialog.
  const handleDownloadMaterial = (modelId: string, material: Material) => {
    if (!material.id) return;
    void (async () => {
      const result = await downloadMaterialAction(modelId, material.id!);
      if (!result.success) {
        alert(`Download failed: ${result.error}`);
        return;
      }
      const { filename, contentType, base64 } = result.data;
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    })();
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
          materials={materialsById[m.id] ?? []}
          onTab={setTab}
          onClose={() => setOpenId(null)}
          onEdit={(id) => setEditId(id)}
          onDuplicate={handleDuplicate}
          onPublish={handlePublish}
          onDelete={handleDelete}
          onUploadMaterial={handleUploadMaterial}
          onDownloadMaterial={handleDownloadMaterial}
        />
      )}
      {creating && (
        <CreateModelForm
          onClose={() => { setCreating(false); setDuplicateSeed(null); }}
          onCreate={(draft) => { setDuplicateSeed(null); handleCreate(draft); }}
          initial={duplicateSeed ?? undefined}
        />
      )}
      {editModel && (
        <EditModelForm
          model={editModel}
          onClose={() => setEditId(null)}
          onSaved={refetch}
        />
      )}
      {calc && <CalcModal models={models} onClose={() => setCalc(false)} />}
    </div>
  );
}
