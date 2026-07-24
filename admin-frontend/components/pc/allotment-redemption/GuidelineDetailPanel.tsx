"use client";

// Investment Guideline detail — read-only fact grid + attached document +
// a notice that Compliance sees this guideline automatically, plus the
// action to upload a new version.

import { Eye, FileText, Send, Upload } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import type { InvestmentGuideline } from "@/lib/pc/investment-guideline-mock";
import { ArDetailShell, ArFact, ArNotice, arLabelCls } from "./parts";

export function GuidelineDetailPanel({
  g, onClose, onUploadVersion,
}: {
  g: InvestmentGuideline;
  onClose: () => void;
  onUploadVersion: (g: InvestmentGuideline) => void;
}) {
  return (
    <ArDetailShell
      eyebrow="Investment guideline"
      title={g.name}
      meta={`${g.mandate} · ${g.ref}`}
      onClose={onClose}
      statusSlot={
        <Chip tone="active" dot={false}>Active</Chip>
      }
    >
      <div className="grid grid-cols-2 gap-[11px]">
        <ArFact label="Client" value={`${g.client} (${g.code})`} />
        <ArFact label="Effective date" value={g.effective} />
        <ArFact label="Version" value={`v${g.version}`} />
        <ArFact label="Uploaded" value={g.uploaded} />
      </div>
      <div className="mt-5">
        <div className={`${arLabelCls} mb-2`}>Attached document</div>
        <div className="flex items-center gap-[11px] rounded-[10px] border border-outline-variant px-3.5 py-3">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[8px] bg-primary-fixed text-primary">
            <FileText size={16} strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-on-surface">{g.file}</div>
            <div className="mt-px text-[12px] text-secondary">Investment guideline document</div>
          </div>
          <Button variant="secondary" icon={Eye} className="px-3 py-2 text-[13px]">View</Button>
        </div>
      </div>
      <div className="mt-5">
        <div className={`${arLabelCls} mb-2`}>Distribution</div>
        <ArNotice tone="info" icon={Send}>
          This guideline is visible to <b>Compliance</b> for review. Changes uploaded here are reflected on the Compliance workspace automatically.
        </ArNotice>
      </div>
      <div className="mt-5 flex justify-end">
        <Button variant="secondary" icon={Upload} onClick={() => onUploadVersion(g)}>Upload new version</Button>
      </div>
    </ArDetailShell>
  );
}
