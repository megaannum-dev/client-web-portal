"use client";

import { Modal, FeeCalc } from "@/components/pc/Shared";
import type { Model } from "@/lib/pc/types";

export function CalcModal({ models, onClose }: { models: Model[]; onClose: () => void }) {
  return (
    <Modal title="Fee reference" subtitle="Estimate the management and incentive fees for a model." onClose={onClose} width={520} centered>
      <FeeCalc models={models} />
    </Modal>
  );
}
