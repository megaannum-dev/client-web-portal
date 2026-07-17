"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { SubscriptionAccordion } from "@/components/rm/SubscriptionAccordion";
import {
  SubscriptionFormModal,
  type SubscriptionModalMode,
  type SubscriptionModalContext,
} from "@/components/rm/SubscriptionFormModal";
import { SUB_CLIENTS } from "@/lib/mock/rm-data";

type ModalState = { mode: SubscriptionModalMode; context: SubscriptionModalContext };

/** Resolve the "Request Tickets" deep-link contract emitted by a parallel
 *  feature: ?client=<SUB_CLIENTS id>&model=<index into that client's .models
 *  array>&mode=<add-allotment|redemption>. Returns null on any missing/invalid
 *  part — callers fall back to today's default view (no throw, no error state). */
function resolveDeepLink(params: URLSearchParams): { openClient: string; openModelKey: string; modal: ModalState } | null {
  const modeParam = params.get("mode");
  if (modeParam !== "add-allotment" && modeParam !== "redemption") return null;
  const clientId = params.get("client");
  const modelParam = params.get("model");
  if (!clientId || !modelParam) return null;
  const modelIdx = Number(modelParam);
  if (!Number.isInteger(modelIdx)) return null;
  const client = SUB_CLIENTS.find((c) => c.id === clientId);
  const model = client?.models[modelIdx];
  if (!client || !model) return null;
  return {
    openClient: client.id,
    openModelKey: `${client.id}-${modelIdx}`,
    modal: {
      mode: modeParam,
      context: {
        clientName: client.name,
        clientId: client.id,
        modelName: model.name,
        modelAccount: model.account,
        mgmtFee: model.mgmtFee,
        incentiveFee: model.incentiveFee,
      },
    },
  };
}

function ModelSubscriptionContent() {
  const searchParams = useSearchParams();
  const [deepLink] = useState(() => resolveDeepLink(searchParams));
  const [modal, setModal] = useState<ModalState | null>(() => deepLink?.modal ?? null);

  const totalClients = SUB_CLIENTS.length;
  const totalModels = SUB_CLIENTS.reduce((s, c) => s + c.models.length, 0);

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-7">
        <PageHeader
          title="Model Subscription"
          subtitle={`Client book → subscribed models → full transaction history. ${totalClients} clients · ${totalModels} subscriptions.`}
          actions={
            <Button icon={Plus} onClick={() => setModal({ mode: "new-subscription", context: {} })}>
              Subscribe Client
            </Button>
          }
        />
      </div>
      <SubscriptionAccordion
        onOpenModal={setModal}
        initialOpenClient={deepLink?.openClient}
        initialOpenModelKey={deepLink?.openModelKey}
      />
      {modal && (
        <SubscriptionFormModal mode={modal.mode} context={modal.context} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

export default function ModelSubscriptionPage() {
  return (
    <Suspense fallback={null}>
      <ModelSubscriptionContent />
    </Suspense>
  );
}
