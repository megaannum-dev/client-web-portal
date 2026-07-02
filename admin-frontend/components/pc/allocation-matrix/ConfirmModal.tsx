"use client";

import { Check, Lock, TriangleAlert } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/pc/Shared";
import { type AllocationView } from "@/lib/pc/allocation";

/* ============================================================
   CONFIRM MODAL  (irreversible until next period) — F3 Modal shell
   ============================================================ */
export function ConfirmModal({
  data, period, onClose, onConfirm,
}: {
  data: AllocationView;
  period: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title={`Confirm ${period} allocation?`}
      subtitle="Confirming freezes the matrix for the period so trading can open."
      onClose={onClose}
      width={470}
      centered
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="ml-auto">Cancel</Button>
          <Button icon={Check} onClick={onConfirm}>Confirm allocation</Button>
        </>
      }
    >
      <div className="flex gap-[13px]">
        <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[11px] bg-primary-fixed text-primary">
          <Lock size={20} strokeWidth={1.75} />
        </span>
        <div className="text-[13.5px] leading-[1.6] text-secondary">
          <b className="text-on-surface">{data.count()} allocations</b> across {data.liveModels.length} live models are ready to confirm.
        </div>
      </div>
      <div
        className="mt-3.5 flex items-start gap-[9px] rounded-[10px] border px-[13px] py-[11px] text-[12.5px] font-semibold leading-[1.55]"
        style={{ color: "#9a5b00", background: "#fff6e6", borderColor: "#ffe2b0" }}
      >
        <TriangleAlert size={15} strokeWidth={2} className="mt-px flex-none" />
        <span>This can’t be undone. The matrix stays frozen until the next allocation period opens.</span>
      </div>
    </Modal>
  );
}
