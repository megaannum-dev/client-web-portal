"use client";

/* ============================================================
   Admin console — audit log modal (shared by both pages)
   FE-9 follow-up: reads AuditOut's wire shape (id, at, actor_name,
   event, detail) — the mock's `ts`/`who`/`what` are gone.
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from "react";
import { getAudit } from "@/app/(roles)/admin/actions";
import { Button } from "@/components/ui/Button";
import { Help, Modal } from "@/components/admin/Shared";
import { useAdminStore } from "@/lib/admin/AdminStoreContext";
import type { AuditOut } from "@/lib/admin/types";
import { todayLabel } from "@/lib/admin/today";

const PAGE = 50;

/** First occurrence of each id wins, order kept. */
const dedupe = (rows: AuditOut[]) => {
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.id) && !!seen.add(r.id));
};

export function AuditModal({ onClose }: { onClose: () => void }) {
  const { audit } = useAdminStore();
  // Pages fetched past the store's newest 50. `refreshAudit` REPLACES the store list, so
  // older pages live here, not in the store, or the next refresh would drop them.
  const [older, setOlder] = useState<AuditOut[]>([]);
  const [hasMore, setHasMore] = useState(audit.length >= PAGE);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  // State, not a ref object: Modal renders null until its portal root exists, so the effect must re-run when the sentinel mounts.
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const rows = useMemo(() => dedupe([...audit, ...older]), [audit, older]);

  // The observer fires once on observe(), so re-creating it after each page keeps loading
  // while the sentinel is still on screen (a tall modal). Default root = the viewport, and
  // Modal's scrolling body clips the sentinel, which is what intersection accounts for.
  useEffect(() => {
    const el = sentinel;
    if (!el || !hasMore) return;
    const loadMore = async () => {
      const last = rows[rows.length - 1];
      if (busy.current || !last) return;
      busy.current = true;
      setLoading(true);
      try {
        const result = await getAudit({ limit: PAGE, before: last.at });
        if (!result.success) throw new Error(result.error);
        // The first page also snapshots the store's newest rows: a later refresh shifts that
        // window, and the rows it drops must stay on screen, not fall into a gap.
        setOlder((prev) => dedupe([...(prev.length ? prev : audit), ...result.data]));
        if (result.data.length < PAGE) setHasMore(false);
      } catch {
        setFailed(true);
        setHasMore(false);
      } finally {
        busy.current = false;
        setLoading(false);
      }
    };
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [sentinel, rows, audit, hasMore]);

  return (
    <Modal
      title="Audit log"
      sub="Every administrative write, newest first"
      width={620}
      onClose={onClose}
      foot={<Button variant="secondary" className="ml-auto" onClick={onClose}>Close</Button>}
    >
      <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--outline-variant)" }}>
        {rows.map((a, i) => {
          const at = new Date(a.at);
          const bad = Number.isNaN(at.getTime());
          const date = bad ? "—" : todayLabel(at);
          const time = bad ? "" : at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
          return (
            <div
              key={a.id}
              className="flex gap-3.5 px-[15px] py-[13px]"
              style={{ borderTop: i ? "1px solid var(--outline-variant)" : "none", background: i === 0 ? "var(--surface-low)" : "#fff" }}
            >
              <div className="w-[132px] flex-shrink-0">
                <div className="text-[12px] font-bold text-on-surface">{date}</div>
                <div className="text-[11.5px] text-secondary">{time} · {a.actor_name.split(" ")[0]}</div>
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold">{a.event}</div>
                <div className="mt-0.5 text-[12px] leading-[1.45] text-secondary">{a.detail}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div ref={setSentinel} aria-hidden className="h-px" />
      {loading && <p className="text-center text-[12px] text-secondary">Loading…</p>}
      {failed && <p role="alert" className="text-center text-[12px] text-secondary">Could not load older entries.</p>}
      <Help>The log is append-only. Publishes carry their change note; overrides carry their reason and expiry.</Help>
    </Modal>
  );
}
