"use client";

// SOP Documents — standard operating procedures by cadence with version history.
// Write controls (upload / new version / delete) are gated on the compliance.sop
// EDIT grant; download + history are open to everyone with page access.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import SopSkeleton from "./Skeleton";
import { Lock, Upload } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { SopCard } from "@/components/compliance/sop/SopCard";
import { SopTable } from "@/components/compliance/sop/SopTable";
import { SopTabs, SopViewToggle, type SopTabValue, type SopView } from "@/components/compliance/sop/SopTabs";
import { SopDetailPanel, type SopPanelTab } from "@/components/compliance/sop/SopDetailPanel";
import { SopUploadDialog } from "@/components/compliance/sop/SopUploadDialog";
import { SopConfirm } from "@/components/compliance/sop/SopConfirm";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCanEdit } from "@/hooks/usePageAccess";
import { useSops } from "@/hooks/api/useSops";
import {
  addSopVersionAction, createSopAction, deleteSopAction, deleteSopVersionAction, downloadSopVersionAction,
} from "./actions";
import { SOP_CATEGORIES, type SopDocumentDTO, type SopVersionDTO } from "@/lib/sop/types";
import { saveBase64File } from "@/lib/download";

const TAB_KEY = "sop-tab";
const VIEW_KEY = "sop-view";

// ponytail: best-effort persistence; failures just reset to the defaults.
function load<T extends string>(key: string, ok: (v: string) => boolean, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v && ok(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* best-effort */ }
}

type Confirm = { sop: SopDocumentDTO; version?: number; versions?: SopVersionDTO[] };

export default function SopDocumentsPage() {
  const { portalUser } = useAuth();
  const canWrite = useCanEdit("compliance.sop");
  const { sops, loading, error, refetch } = useSops();

  const [tab, setTab] = useState<SopTabValue>("all");
  const [view, setView] = useState<SopView>("cards");
  useEffect(() => {
    setTab(load<SopTabValue>(TAB_KEY, (v) => v === "all" || SOP_CATEGORIES.some((c) => c.key === v), "all"));
    setView(load<SopView>(VIEW_KEY, (v) => v === "rows", "cards"));
  }, []);
  const changeTab = (t: SopTabValue) => { setTab(t); save(TAB_KEY, t); };
  const changeView = (v: SopView) => { setView(v); save(VIEW_KEY, v); };

  const [panel, setPanel] = useState<{ id: string; tab: SopPanelTab } | null>(null);
  const [upload, setUpload] = useState<{ target?: SopDocumentDTO } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(
    () =>
      (sops ?? [])
        .filter((s) => tab === "all" || s.category === tab)
        .sort((a, b) => b.latest.uploaded_at.localeCompare(a.latest.uploaded_at)),
    [sops, tab],
  );
  const panelSop = panel ? (sops ?? []).find((s) => s.id === panel.id) : undefined;

  // Returned promise drives the clicked button's spinner; rejection (dropped action) is toasted too.
  const doDownload = (sop: SopDocumentDTO, v: SopVersionDTO = sop.latest) =>
    downloadSopVersionAction(sop.id, v.version_no)
      .then((r) => {
        if (!r.success) return void toast.error(`Download failed: ${r.error}`);
        saveBase64File(v.filename, r.data.contentType, r.data.base64);
      })
      .catch(() => void toast.error("Download failed. Please try again."));

  /** Run a mutation; toast + report failure, refetch on success. */
  const mutate = async (run: () => Promise<{ success: boolean; error?: string }>) => {
    const r = await run();
    if (r.success) refetch();
    else toast.error(r.error ?? "Request failed");
    return r;
  };

  const doUpload = (fd: FormData) => {
    const target = upload?.target;
    return mutate(() => (target ? addSopVersionAction(target.id, fd) : createSopAction(fd)));
  };

  const doConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    const { sop, version, versions } = confirm;
    const r = await mutate(() => (version === undefined ? deleteSopAction(sop.id) : deleteSopVersionAction(sop.id, version)));
    setBusy(false);
    if (!r.success) return;
    setConfirm(null);
    // Deleting the whole SOP, or its only version, removes it.
    if (version === undefined || sop.version_count <= 1 || (versions && versions.length <= 1)) setPanel(null);
  };

  if (loading && !sops) return <SopSkeleton />;

  const handlers = {
    onOpen: (id: string, t: SopPanelTab) => setPanel({ id, tab: t }),
    onUpload: (sop: SopDocumentDTO) => setUpload({ target: sop }),
    onDownload: (sop: SopDocumentDTO) => doDownload(sop),
    onDelete: (sop: SopDocumentDTO) => setConfirm({ sop }),
    openId: panel?.id ?? null,
  };

  return (
    <div className="relative -mx-16 -my-8 min-h-[calc(100vh_-_64px)]">
      <div className="px-16 py-8">
        <div className="mx-auto">
          <PageHeader
            title="SOP Documents"
            subtitle="Standard operating procedures by cadence, with full version history."
            actions={
              canWrite ? (
                <Button icon={Upload} onClick={() => setUpload({})}>Upload SOP</Button>
              ) : (
                <span className="inline-flex items-center gap-1.5 self-center text-[13px] text-secondary">
                  <Lock size={14} strokeWidth={2} />Read only — managed by Super Admin
                </span>
              )
            }
          />

          {error ? (
            <div className="mt-6 rounded-md border border-outline-variant bg-surface-lowest px-4 py-3 text-[13.5px] text-error">{error}</div>
          ) : (
            <>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <SopTabs value={tab} onChange={changeTab} />
                <SopViewToggle value={view} onChange={changeView} />
              </div>

              {filtered.length === 0 ? (
                <div className="mt-5 rounded-lg border border-outline-variant bg-surface-lowest px-5 py-16 text-center text-[13.5px] text-secondary">
                  No SOPs in this category yet.
                </div>
              ) : view === "cards" ? (
                <div className="mt-5 grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
                  {filtered.map((s) => <SopCard key={s.id} sop={s} {...handlers} />)}
                </div>
              ) : (
                <div className="mt-5"><SopTable sops={filtered} {...handlers} /></div>
              )}
            </>
          )}
        </div>
      </div>

      {panel && panelSop && (
        <SopDetailPanel
          sop={panelSop}
          tab={panel.tab}
          onTab={(t) => setPanel({ id: panel.id, tab: t })}
          onClose={() => setPanel(null)}
          onDownload={(v) => doDownload(panelSop, v)}
          onUpload={() => setUpload({ target: panelSop })}
          onDeleteSop={() => setConfirm({ sop: panelSop })}
          onDeleteVersion={(v, versions) => setConfirm({ sop: panelSop, version: v.version_no, versions })}
          confirmOpen={!!confirm}
        />
      )}

      {canWrite && upload && portalUser && (
        <SopUploadDialog
          target={upload.target}
          defaultCategory={tab === "all" ? "daily" : tab}
          onClose={() => setUpload(null)}
          onSubmit={doUpload}
          uploaderName={portalUser.name ?? portalUser.email ?? "Unknown"}
          uploaderRole={portalUser.role}
        />
      )}

      {canWrite && confirm && (
        <SopConfirm
          sop={confirm.sop}
          version={confirm.version}
          versions={confirm.versions}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={doConfirm}
        />
      )}
    </div>
  );
}
