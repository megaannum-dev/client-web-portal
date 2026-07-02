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

   The card grid, table, detail panel, tabs, and modal components that
   used to live in this file now live under
   `components/pc/model-management/*` — this file wires them together
   with the page-level state and server-action handlers.
   ============================================================ */

import { useState, useEffect } from "react";
import { LayoutGrid, List, Calculator, Plus } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { fmtMoney, mapDtoToModel, mapDtoToMaterial } from "@/lib/pc/models";
import type { Material, Model, ModelStatus } from "@/lib/pc/types";
import { useModels } from "@/hooks/api/useModels";
import {
  createModel as createModelAction,
  publishModel as publishModelAction,
  uploadMaterial as uploadMaterialAction,
  getMaterials as getMaterialsAction,
  downloadMaterial as downloadMaterialAction,
  deleteModel as deleteModelAction
} from "@/app/(roles)/pc/model-management/actions";
import { CardGrid } from "@/components/pc/model-management/CardGrid";
import { ModelTable } from "@/components/pc/model-management/ModelTable";
import { ModelDetailPanel } from "@/components/pc/model-management/ModelDetailPanel";
import { CreateModelForm, type NewModelDraft } from "@/components/pc/model-management/CreateModelForm";
import { EditModelForm } from "@/components/pc/model-management/EditModelForm";
import { CalcModal } from "@/components/pc/model-management/CalcModal";

/* Today as an ISO date (YYYY-MM-DD) — matches the change-history /
   material date format used throughout the model book. */
const isoToday = () => new Date().toISOString().slice(0, 10);

type Layout = "grid" | "table";
type Tab = "overview" | "materials" | "changes";

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
