"use client";

import { useState } from "react";
import { X, Check, TriangleAlert } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { SectionLabel } from "@/components/compliance/Shared";
import { DOC_NAMES, type DocVerdict, type Onboarding } from "@/lib/compliance/mock";

export function RejectModal({
  o, onCancel, onConfirm, verdicts,
}: {
  o: Onboarding;
  onCancel: () => void;
  onConfirm: (id: string, reason: string) => void;
  verdicts: DocVerdict[];
}) {
  const [flags, setFlags] = useState<boolean[]>(() =>
    (verdicts.length ? verdicts : o.docs.map(() => null)).map((v) => v === "issue"),
  );
  const [reason, setReason] = useState("");
  const count = flags.filter(Boolean).length;
  const toggle = (i: number) => setFlags((f) => f.map((v, j) => (j === i ? !v : v)));

  return (
    <div
      className="absolute inset-0 z-[20] flex items-center justify-center p-6"
      style={{ background: "rgba(30,28,24,0.42)", backdropFilter: "blur(3px)" }}
    >
      <div
        className="flex max-h-full w-[560px] max-w-full flex-col overflow-hidden rounded-[20px] bg-surface-lowest shadow-overlay"
      >
        <div className="flex justify-between gap-3 border-b border-outline-variant px-6 pb-4 pt-5">
          <div>
            <div className="text-[19px] font-bold tracking-[-0.01em]">Reject onboarding</div>
            <div className="mt-1 text-[13px] text-secondary">
              Flag which documents are invalid so {o.rm} can correct and resubmit.
            </div>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" className="flex h-fit cursor-pointer p-[3px] text-secondary">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-[18px]">
          <SectionLabel>Flag invalid documents</SectionLabel>
          <div className="mb-5 flex flex-col gap-1.5">
            {DOC_NAMES.map((n, i) => {
              const on = flags[i];
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggle(i)}
                  className="flex cursor-pointer items-center gap-[11px] rounded-[9px] px-[11px] py-[9px] text-left"
                  style={{
                    border: `1px solid ${on ? "var(--primary)" : "var(--outline-variant)"}`,
                    background: on ? "var(--primary-fixed)" : "#fff",
                  }}
                >
                  <span
                    className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] text-white"
                    style={{
                      border: `1px solid ${on ? "var(--primary)" : "var(--outline)"}`,
                      background: on ? "var(--primary)" : "#fff",
                    }}
                  >
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span className="text-[13px] font-semibold" style={{ color: on ? "var(--primary)" : "var(--on-surface)" }}>
                    {n}
                  </span>
                </button>
              );
            })}
          </div>
          <SectionLabel>Reason (optional)</SectionLabel>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. Signature page missing on IPS; derivatives form references wrong client name…"
            className="box-border w-full resize-y rounded-[9px] border border-outline-variant px-3 py-2.5 text-[14px] text-on-surface outline-none"
          />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-outline-variant px-6 py-3.5">
          <span
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold"
            style={{ color: count ? "#c2410c" : "var(--secondary)" }}
          >
            <TriangleAlert size={13} strokeWidth={2} />
            {count} document{count === 1 ? "" : "s"} flagged
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button icon={X} onClick={() => onConfirm(o.id, reason)}>Confirm rejection</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
