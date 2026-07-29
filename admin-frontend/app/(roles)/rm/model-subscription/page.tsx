"use client";

import { Suspense, useEffect, useRef, useState } from "react";
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
import { OB_MODEL_CATALOG, type SubClient } from "@/lib/mock/rm-data";
import { useSubscriptions } from "@/hooks/api/useSubscriptions";

type ModalState = { mode: SubscriptionModalMode; context: SubscriptionModalContext };

/** Resolve the "Request Tickets" deep-link contract: ?client=<real client_id>
 *  &model=<real model_id>&mode=<add-allotment|redemption>, matched against the
 *  caller's own live subscription data (both ids are real backend uuids now,
 *  not a mock fixture / array index). Returns null on any missing/invalid
 *  part — callers fall back to today's default view (no throw, no error state). */
function resolveDeepLink(params: URLSearchParams, clients: SubClient[]): { openClient: string; openModelKey: string; modal: ModalState } | null {
  const modeParam = params.get("mode");
  if (modeParam !== "add-allotment" && modeParam !== "redemption") return null;
  const clientId = params.get("client");
  const modelId = params.get("model");
  if (!clientId || !modelId) return null;
  const client = clients.find((c) => c.id === clientId);
  if (!client) return null;
  const modelIdx = client.models.findIndex((m) => m.modelId === modelId);
  const model = modelIdx === -1 ? undefined : client.models[modelIdx];
  if (!model) return null;
  return {
    openClient: client.id,
    openModelKey: `${client.id}-${modelIdx}`,
    modal: {
      mode: modeParam,
      context: {
        clientName: client.name,
        clientId: client.id,
        modelName: model.name,
        modelId: model.modelId,
        modelSize: model.modelSize,
        modelAccount: model.account,
        mgmtFee: model.mgmtFee,
        incentiveFee: model.incentiveFee,
      },
    },
  };
}

function ModelSubscriptionContent() {
  const searchParams = useSearchParams();
  const { clients, ensureAllotmentsLoaded, refetch, invalidateClientAllotments } = useSubscriptions();
  const [deepLink, setDeepLink] = useState<{ openClient: string; openModelKey: string } | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const deepLinkApplied = useRef(false);

  useEffect(() => {
    if (deepLinkApplied.current || !clients) return;
    deepLinkApplied.current = true;
    const resolved = resolveDeepLink(searchParams, clients);
    if (resolved) {
      setDeepLink({ openClient: resolved.openClient, openModelKey: resolved.openModelKey });
      setModal(resolved.modal);
    }
  }, [clients, searchParams]);

  const totalClients = clients?.length ?? 0;
  const totalModels = clients?.reduce((s, c) => s + c.models.length, 0) ?? 0;
  const availableClients = clients?.map((c) => ({ id: c.id, name: c.name })) ?? [];
  // ponytail: no models-list endpoint exists yet in this layer's scope — interim source is
  // the mock model/fee catalog, already shaped as {id, name, mgmtFee, incentiveFee}. Swap for
  // a real models-list hook when that endpoint lands.
  const availableModels = OB_MODEL_CATALOG.map((m) => ({
    id: m.model_id,
    name: m.name,
    mgmtFee: m.mgmtFee,
    incentiveFee: m.incentiveFee,
  }));

  return (
    <div className="mx-auto">
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
        clients={clients ?? []}
        onClientOpen={ensureAllotmentsLoaded}
        onOpenModal={setModal}
        initialOpenClient={deepLink?.openClient}
        initialOpenModelKey={deepLink?.openModelKey}
        onTransactionDetailFiled={invalidateClientAllotments}
      />
      {modal && (
        <SubscriptionFormModal
          mode={modal.mode}
          context={modal.context}
          availableClients={availableClients}
          availableModels={availableModels}
          onClose={() => setModal(null)}
          onSuccess={() => {
            refetch();
            if (modal.context.clientId) invalidateClientAllotments(modal.context.clientId);
          }}
        />
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
