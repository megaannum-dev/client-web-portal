"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2 } from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/components/auth/AuthProvider";
import { useChatRoom } from "@/components/rm/chat/ChatRoomProvider";
import { CorrespondentsToolbar } from "@/components/rm/correspondents/CorrespondentsToolbar";
import { CorrespondentsTable } from "@/components/rm/correspondents/CorrespondentsTable";
import { INITIAL_UI, toQuery, type CorrespondentsUi } from "@/components/rm/correspondents/toQuery";
import { downloadAttachment, type ChatDocumentDTO } from "@/lib/api/chat";
import { useChatDocumentSenders, useChatDocuments } from "@/lib/chat/useChatDocuments";

export default function ClientCorrespondentsPage() {
  const { portalUser, getIdToken } = useAuth();
  const { openRoom } = useChatRoom();
  const [ui, setUiState] = useState<CorrespondentsUi>(INITIAL_UI);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(ui.q), 300);
    return () => clearTimeout(t);
  }, [ui.q]);

  // Any filter change resets selection (the list resets to page 1 too).
  const setUi = useCallback((patch: Partial<CorrespondentsUi>) => {
    setUiState((s) => ({ ...s, ...patch }));
    if (Object.keys(patch).some((k) => k !== "sort")) setSelected(new Set());
  }, []);

  const query = useMemo(() => toQuery({ ...ui, q: debouncedQ }, new Date()), [ui, debouncedQ]);
  const { docs, total, loading, loadingMore, error, hasMore, loadMore } = useChatDocuments(query);
  const { senders } = useChatDocumentSenders();

  // Infinite scroll: sentinel under the table, rooted on the scrolling <main>.
  const sentinel = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  const canLoad = hasMore && !loadingMore;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !canLoad) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) loadMoreRef.current(); },
      { root: el.closest("main"), rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [canLoad, docs.length]);

  const download = useCallback(
    async (d: ChatDocumentDTO) => downloadAttachment(await getIdToken(), d.id, d.filename),
    [getIdToken],
  );
  const bulkDownload = async () => {
    setBulkBusy(true);
    try {
      for (const d of docs) if (selected.has(d.id)) await download(d);
    } finally {
      setBulkBusy(false);
    }
  };
  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (!n.delete(id)) n.add(id);
    return n;
  });
  const toggleAll = (on: boolean) => setSelected(on ? new Set(docs.map((d) => d.id)) : new Set());
  const show = (d: ChatDocumentDTO) =>
    openRoom({ id: d.client_id, name: d.client_name, assignedRm: d.rm_name ?? undefined }, { focusAttachmentId: d.id });

  const filtered = ui.view !== "all" || ui.preset !== "any" || ui.senders.length > 0 || !!debouncedQ;

  return (
    <div className="mx-auto">
      <div className="mb-7">
        <PageHeader
          title="Client Correspondents"
          subtitle="Every document and attachment exchanged with your clients in chat."
        />
      </div>

      <section className="overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
        <CorrespondentsToolbar ui={ui} setUi={setUi} senders={senders} />

        {selected.size > 0 && (
          <div className="flex items-center gap-3 border-b border-outline-variant bg-primary/5 px-5 py-2.5 text-[13px]">
            <span className="font-semibold">{selected.size} selected</span>
            <Button icon={Download} onClick={bulkDownload} disabled={bulkBusy}>
              {bulkBusy ? "Downloading…" : "Download"}
            </Button>
            <button type="button" onClick={() => setSelected(new Set())} className="font-semibold text-primary hover:underline">
              Clear selection
            </button>
          </div>
        )}

        {error && <div className="px-5 py-3 text-[13px] text-error">{error}</div>}

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-secondary" /></div>
        ) : (
          <CorrespondentsTable
            docs={docs}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            sort={ui.sort}
            onSort={() => setUi({ sort: ui.sort === "desc" ? "asc" : "desc" })}
            meUid={portalUser?.firebase_uid ?? null}
            onDownload={download}
            onShow={show}
            filtered={filtered}
          />
        )}

        <div ref={sentinel} data-testid="docs-sentinel" className="h-px" />
        {loadingMore && (
          <div className="flex justify-center py-3"><Loader2 size={18} className="animate-spin text-secondary" /></div>
        )}

        <footer className="border-t border-outline-variant px-5 py-3 text-[12.5px] text-secondary">
          Showing {docs.length} of {total} documents
        </footer>
      </section>
    </div>
  );
}
