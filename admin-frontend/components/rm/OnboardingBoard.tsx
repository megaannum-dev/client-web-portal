"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Shield, X, Bell, Check, Upload, Clock, TriangleAlert, AlertCircle } from "@/lib/icons";
import type { LucideIcon } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import {
  KYC_COLS,
  KYC_DOCS,
  VERIFIED_COUNT,
  TONE_FOR,
  KNOWN_CLIENT_IDS,
  type KycClient,
} from "@/lib/mock/rm-data";
import type { ChipTone } from "@/components/ui/Chip";

const DOC_ICON: Record<string, LucideIcon> = {
  active: Check, pending: Clock, review: Clock, failed: X, overdue: TriangleAlert, neutral: Clock,
};
const DOC_TINT: Record<string, [string, string]> = {
  active:  ["#e3f1e7", "#2f7a47"],
  pending: ["#f8ecd6", "#b9741f"],
  review:  ["#eef2f7", "#585f6c"],
  failed:  ["#f6dfd9", "#b1402f"],
  overdue: ["#ffebee", "#b71c1c"],
  neutral: ["#f3f4f5", "#5f5e5e"],
};

function KanbanCard({ item, selected, onClick }: { item: KycClient; selected: boolean; onClick: () => void }) {
  const count = VERIFIED_COUNT[item.preset];
  const tone = TONE_FOR[item.preset];
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full flex-col gap-2.5 rounded-md border-[1.5px] p-4 text-left transition-all duration-150",
        selected ? "border-primary" : "border-outline-variant bg-white hover:border-outline hover:bg-surface-low",
      )}
      style={selected ? { background: "rgba(242,116,5,.07)" } : undefined}
    >
      <div className="flex items-start justify-between gap-2.5">
        <span className="text-[14px] font-semibold leading-tight text-on-surface">{item.name}</span>
        {item.preset === "none"
          ? <Chip tone="neutral" dot={false}>Not started</Chip>
          : <Chip tone={tone} dot={false}>{count}/7 verified</Chip>}
      </div>
      <div className="flex items-center gap-1.5 text-[12px] text-secondary">
        <Shield size={13} strokeWidth={1.75} />
        <span>KYC &amp; docs · {item.owner}</span>
      </div>
    </button>
  );
}

// Statuses that block submission — doc is not yet "provided".
const BLOCKING_STATUSES = new Set(["Not started", "Pending", "Rejected", "Expired"]);

function KycPanel({ item, onClose, onOpenProfile }: { item: KycClient; onClose: () => void; onOpenProfile: (id: string) => void }) {
  const docs = KYC_DOCS[item.preset] ?? KYC_DOCS.none;
  const count = VERIFIED_COUNT[item.preset];
  const [hovered, setHovered] = useState<number | null>(null);

  const outstanding = docs.filter(([, status]) => BLOCKING_STATUSES.has(status)).length;
  const canSubmit = outstanding === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-outline-variant px-5 pb-3.5 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[16px] font-bold leading-tight text-on-surface">{item.name}</div>
            <div className="mt-1 text-[12px] text-secondary">KYC Review · {item.owner}</div>
          </div>
          <button type="button" onClick={onClose} className="flex shrink-0 rounded p-1 text-secondary hover:bg-surface-container">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="mt-3.5 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">KYC &amp; Compliance Docs</span>
          <Chip tone={TONE_FOR[item.preset]} dot={false}>{count}/7 verified</Chip>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-1">
        {docs.map(([name, status, tone], i) => {
          const [bg, fg] = DOC_TINT[tone] ?? DOC_TINT.neutral;
          const Glyph = DOC_ICON[tone] ?? Clock;
          const hov = hovered === i;
          return (
            <div
              key={name}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              className={clsx("flex items-center gap-3 py-[13px]", i < docs.length - 1 && "border-b border-outline-variant")}
            >
              <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md" style={{ background: bg, color: fg }}>
                <Glyph size={14} strokeWidth={2} />
              </span>
              <span className="flex-1 text-[14px] font-semibold text-on-surface">{name}</span>
              {hov ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-[5px] text-[12px] font-semibold text-primary"
                  style={{ background: "rgba(242,116,5,.12)" }}
                >
                  <Upload size={13} strokeWidth={2} />Upload
                </button>
              ) : (
                <Chip tone={tone as ChipTone} dot={false}>{status}</Chip>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex shrink-0 flex-col gap-2.5 border-t border-outline-variant px-5 py-3.5">
        {!canSubmit && (
          <div className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "#b9741f" }}>
            <AlertCircle size={14} strokeWidth={2} className="shrink-0" />
            <span>{outstanding} document{outstanding === 1 ? "" : "s"} still required before you can submit.</span>
          </div>
        )}
        <div className="flex gap-2.5">
          <Button variant="secondary" icon={Bell} full>Request docs</Button>
          <Button icon={Check} full disabled={!canSubmit}>Submit All</Button>
        </div>
        <button
          type="button"
          onClick={() => onOpenProfile(item.id)}
          className="py-0.5 text-left text-[13px] font-semibold text-primary"
        >
          Open client profile →
        </button>
      </div>
    </div>
  );
}

export function OnboardingBoard() {
  const router = useRouter();
  const [selected, setSelected] = useState<KycClient | null>(null);
  const panelOpen = !!selected;

  const openProfile = (id: string) => {
    if (KNOWN_CLIENT_IDS.has(id)) {
      setSelected(null);
      router.push(`/rm/client-detail/${id}`);
    }
  };

  return (
    <>
      <div className="mb-[18px] flex items-center justify-between">
        <span className="text-[13px] text-secondary">9 clients across 4 queues</span>
        {panelOpen && <span className="text-[12px] text-secondary">Click × to close panel</span>}
      </div>

      <div className="relative min-h-[420px]">
        <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
          {KYC_COLS.map((col) => (
            <div key={col.label}>
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[12px] font-bold uppercase tracking-[0.05em] text-secondary">{col.label}</span>
                <span className="text-[12px] font-bold text-secondary">{col.clients.length}</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {col.clients.map((item) => (
                  <KanbanCard
                    key={item.id}
                    item={item}
                    selected={selected?.id === item.id}
                    onClick={() => setSelected(selected?.id === item.id ? null : item)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Slide-in panel — fixed to viewport right edge */}
      <div
        className="fixed bottom-0 right-0 top-16 z-40 overflow-hidden border-l border-outline-variant bg-white transition-[width,box-shadow] duration-200 ease-out"
        style={{
          width: panelOpen ? 360 : 0,
          boxShadow: panelOpen ? "-8px 0 32px rgba(0,0,0,.12)" : "none",
        }}
      >
        <div className="flex h-full w-[360px] flex-col">
          {selected && <KycPanel item={selected} onClose={() => setSelected(null)} onOpenProfile={openProfile} />}
        </div>
      </div>
    </>
  );
}
