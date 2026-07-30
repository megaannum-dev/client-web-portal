"use client";

/* ============================================================
   Admin console — audit log modal (shared by both pages)
   FE-9 follow-up: reads AuditOut's wire shape (id, at, actor_name,
   event, detail) — the mock's `ts`/`who`/`what` are gone.
   ============================================================ */
import { Button } from "@/components/ui/Button";
import { Help, Modal } from "@/components/admin/Shared";
import { useAdminStore } from "@/lib/admin/AdminStoreContext";
import { todayLabel } from "@/lib/admin/today";

export function AuditModal({ onClose }: { onClose: () => void }) {
  const { audit } = useAdminStore();
  return (
    <Modal
      title="Audit log"
      sub="Every administrative write, newest first"
      width={620}
      onClose={onClose}
      foot={<Button variant="secondary" className="ml-auto" onClick={onClose}>Close</Button>}
    >
      <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--outline-variant)" }}>
        {audit.map((a, i) => {
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
      <Help>The log is append-only. Publishes carry their change note; overrides carry their reason and expiry.</Help>
    </Modal>
  );
}
