"use client";

import { Eye, Download, Info, FileText } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { DetailShell, Fact, SectionLabel } from "@/components/compliance/Shared";
import { GrStatusChip, VersionBadge } from "./GuidelineTable";
import type { Guideline } from "@/lib/compliance/mock";

export function GuidelineDetailPanel({
  g, onClose,
}: {
  g: Guideline;
  onClose: () => void;
}) {
  return (
    <DetailShell
      eyebrow="Investment guideline · read-only"
      title={g.name}
      meta={`${g.mandate} · ${g.ref}`}
      statusSlot={<GrStatusChip status={g.status} />}
      onClose={onClose}
    >
      <div className="grid grid-cols-2 gap-[11px]">
        <Fact k="Client" v={g.client} vSize={14} />
        <Fact k="Portfolio Manager" v={g.pm} vSize={14} />
        <Fact k="Effective date" v={g.effective} vSize={14} />
        <Fact k="Version" v={<VersionBadge v={g.version} />} />
      </div>
      <div className="mt-5">
        <SectionLabel>Attached document</SectionLabel>
        <div className="flex items-center gap-[11px] rounded-[10px] border border-outline-variant px-[14px] py-3">
          <span
            className="flex h-8 w-8 flex-none items-center justify-center rounded-lg"
            style={{ background: "var(--primary-fixed)", color: "var(--primary)" }}
          >
            <FileText size={16} strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-on-surface">{g.file}</div>
            <div className="mt-px text-[12px] text-secondary">Investment guideline document</div>
          </div>
          <Button variant="secondary" icon={Eye} className="px-3 py-2">View</Button>
          <Button variant="secondary" icon={Download} className="px-3 py-2">Download</Button>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-2 text-[13px] text-secondary">
        <Info size={15} strokeWidth={2} />No approval needed — view-only access.
      </div>
    </DetailShell>
  );
}
