"use client";

import { useState } from "react";
import { X, Rocket, Trash2 } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { StatusChip, Ticks } from "@/components/pc/Shared";
import { fmtMoney } from "@/lib/pc/format";
import type { Material, Model } from "@/lib/pc/types";
import { MaterialsTab } from "./MaterialsTab";
import { ChangesTab } from "./ChangesTab";
import { OverviewTab } from "./OverviewTab";
import { SymbolsTab } from "./SymbolsTab";

type Tab = "overview" | "symbols" | "materials" | "changes";

/* ============================================================
   SLIDE-IN DETAIL  (Overview · Symbols · Materials · Changes)
   ============================================================ */
export function ModelDetailPanel({
  m, tab, materials, onTab, onClose, onEdit, onDuplicate, onOpenSymbols, onPublish, onDelete, onUploadMaterial, onDownloadMaterial, onRefetch,
}: {
  m: Model;
  tab: Tab;
  materials: Material[];
  initialOpenSym?: string | null;
  onTab: (t: Tab) => void;
  onClose: () => void;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onOpenSymbols: () => void;
  onPublish: (id: string) => void;
  onDelete: (id: string) => void;
  onUploadMaterial: (id: string, file: File) => Promise<boolean>;
  onDownloadMaterial: (modelId: string, material: Material) => void;
  onRefetch: () => void;
}) {
  const TABS: [Tab, string][] = [["overview", "Overview"], ["symbols", "Symbols"], ["materials", "Materials"], ["changes", "Changes"]];
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <>
      <div onClick={onClose} className="absolute inset-0 z-[8]" style={{ background: "rgba(40,38,34,0.18)" }} />
      <div
        className="absolute bottom-[18px] right-[18px] top-[18px] z-[9] flex flex-col overflow-hidden rounded-[18px] border border-outline-variant bg-surface-lowest shadow-overlay"
        style={{ width: "clamp(380px, 32vw, 540px)", maxWidth: "calc(100% - 36px)" }}
      >
        <div className="flex-none border-b border-outline-variant px-[22px] pb-3.5 pt-[18px]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[20px] font-bold tracking-[-0.01em]">{m.name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-secondary">
                {m.category.length > 0 ? <Ticks symbols={m.category} /> : <span>—</span>}
                <span>· {fmtMoney(m.size)}</span>
              </div>
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
          ) : tab === "symbols" ? (
            <SymbolsTab m={m} onMutate={onRefetch} />
          ) : (
            <OverviewTab m={m} onEdit={onEdit} onDuplicate={onDuplicate} onOpenSymbols={onOpenSymbols} />
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
