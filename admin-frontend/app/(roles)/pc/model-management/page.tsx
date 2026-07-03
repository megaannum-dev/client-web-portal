"use client";

// PC — Model Management: card/table layout + slide-in detail panel,
// New-model/Edit forms, fee calc. All data/mutations flow through
// useModels (list) and useModelDetail (open model's materials + changes).

import { useState } from "react";
import { LayoutGrid, List, Calculator, Plus } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { useModels } from "@/hooks/api/useModels";
import { useModelDetail } from "@/hooks/api/useModelDetail";
import { CardGrid } from "@/components/pc/model-management/CardGrid";
import { ModelTable } from "@/components/pc/model-management/ModelTable";
import { ModelDetailPanel } from "@/components/pc/model-management/ModelDetailPanel";
import { CreateModelForm, type NewModelDraft } from "@/components/pc/model-management/CreateModelForm";
import { EditModelForm } from "@/components/pc/model-management/EditModelForm";
import { CalcModal } from "@/components/pc/model-management/CalcModal";

type Layout = "grid" | "table";
type Tab = "overview" | "materials" | "changes";

// Rehydrate a base64 download payload into a Blob and trigger a save dialog.
function saveBase64File(filename: string, contentType: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

const TOGGLES: [Layout, typeof LayoutGrid, string][] = [
  ["grid", LayoutGrid, "Card view"],
  ["table", List, "Table view"],
];

export default function ModelManagementPage() {
  const { data: models, refetch, createModel, updateModel, downloadLatestMaterial } = useModels();
  const [layout, setLayout] = useState<Layout>("grid");
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [creating, setCreating] = useState(false);
  const [calc, setCalc] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [duplicateSeed, setDuplicateSeed] = useState<NewModelDraft | null>(null);
  const { data: detail, refetch: refetchDetail, uploadMaterial: upload, downloadMaterial: download } = useModelDetail(openId);
  const safeModels = models ?? [];
  const draftCount = safeModels.filter((x) => x.status === "draft").length;
  const open = (id: string, t: Tab) => { setOpenId(id); setTab(t || "overview"); };
  const m = safeModels.find((x) => x.id === openId);
  const editModel = editId ? safeModels.find((x) => x.id === editId) : undefined;

  // Create → optional upload → optional publish is orchestrated inside useModels.createModel.
  const handleCreate = (draft: NewModelDraft) => {
    setCreating(false); setDuplicateSeed(null);
    void createModel(draft).then((r) => {
      if (!r.success) { alert(`Could not create model: ${r.error}`); return; }
      setOpenId(r.id ?? null); setTab("overview");
    });
  };
  // Publish/delete are status PATCHes — same endpoint the backend's dedicated routes use.
  const handlePublish = (id: string) => void updateModel(id, { status: "live" }).then((r) => { if (!r.success) alert(`Could not publish: ${r.error}`); });
  const handleDelete = (id: string) => void updateModel(id, { status: "deleted" }).then((r) => { if (r.success) setOpenId(null); });
  // Duplicate: close the detail panel and open New-model pre-filled.
  const handleDuplicate = (id: string) => {
    const src = safeModels.find((x) => x.id === id);
    if (!src) return;
    setDuplicateSeed({
      name: `${src.name} (copy)`, category: src.category, subscription_redemption: src.subscription_redemption, size: src.size, symbols: [...src.symbols],
      status: "draft", file: null,
      description: src.description ?? undefined, underlyings: src.underlyings ?? undefined,
      risk: src.risk ?? undefined, liquidity: src.liquidity ?? undefined,
      reporting: src.reporting ?? undefined, nav_perf: src.nav_perf ?? undefined,
      mgmt_fee: src.mgmt_fee, incentive_fee: src.incentive_fee,
    });
    setOpenId(null); setCreating(true);
  };
  const handleDownloadLatest = (modelId: string) => {
    void downloadLatestMaterial(modelId).then((r) =>
      r.success ? saveBase64File(r.filename!, r.contentType!, r.base64!) : alert(`Download failed: ${r.error}`)
    );
  };

  return (
    <div className="relative -mx-16 -my-8 min-h-[calc(100vh_-_64px)]">
      <div className="px-16 py-8">
        <div className="mb-[26px] flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-on-surface">Model Management</h1>
            <p className="mt-1.5 text-[15px] text-secondary">
              Create and manage the firm&rsquo;s trading strategies · {safeModels.length} models · {draftCount} draft
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex overflow-hidden rounded border border-outline">
              {TOGGLES.map(([k, IconCmp, title]) => (
                <button key={k} type="button" onClick={() => setLayout(k)} title={title}
                  className={`flex cursor-pointer items-center border-none px-[11px] py-2 transition-all duration-150 ${layout === k ? "bg-primary text-white" : "bg-white text-secondary"}`}>
                  <IconCmp size={17} strokeWidth={1.9} />
                </button>
              ))}
            </div>
            <Button variant="secondary" icon={Calculator} onClick={() => setCalc(true)} title="Fee calculator" aria-label="Fee calculator" className="px-[13px] py-2.5" />
            <Button icon={Plus} onClick={() => setCreating(true)}>New model</Button>
          </div>
        </div>
        {layout === "grid" ? (
          <CardGrid models={safeModels} onOpen={open} />
        ) : (
          <ModelTable models={safeModels} onOpen={open} onDownloadLatest={handleDownloadLatest} />
        )}
      </div>
      {m && (
        <ModelDetailPanel
          m={detail?.model ?? m} tab={tab} materials={detail?.materials ?? []}
          onTab={setTab} onClose={() => setOpenId(null)} onEdit={(id) => setEditId(id)}
          onDuplicate={handleDuplicate} onPublish={handlePublish} onDelete={handleDelete}
          onUploadMaterial={async (_id, file) => { const r = await upload(file); if (!r.success) alert(`Upload failed: ${r.error}`); return r.success; }}
          onDownloadMaterial={(_modelId, material) => { if (!material.id) return; void download(material.id).then((r) => (r.success ? saveBase64File(r.filename!, r.contentType!, r.base64!) : alert(`Download failed: ${r.error}`))); }}
        />
      )}
      {creating && (
        <CreateModelForm
          onClose={() => { setCreating(false); setDuplicateSeed(null); }}
          onCreate={(draft) => { setDuplicateSeed(null); handleCreate(draft); }}
          initial={duplicateSeed ?? undefined}
        />
      )}
      {editModel && <EditModelForm model={editModel} onClose={() => setEditId(null)} onSaved={() => { refetch(); refetchDetail(); }} />}
      {calc && <CalcModal models={safeModels} onClose={() => setCalc(false)} />}
    </div>
  );
}
