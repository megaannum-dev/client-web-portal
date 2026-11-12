"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { SubscriptionAccordion } from "@/components/rm/SubscriptionAccordion";
import {
  SubscriptionFormModal,
  type SubscriptionModalMode,
  type SubscriptionModalContext,
} from "@/components/rm/SubscriptionFormModal";
import type { SubClient } from "@/lib/rm/subscriptions";
import { useSubscriptions } from "@/hooks/api/useSubscriptions";
import { useModels } from "@/hooks/api/useModels";
import { useClientBook } from "@/hooks/api/useClientBook";
import { useOnboardingBoard } from "@/hooks/api/useOnboardingBoard";
import { useCanEdit } from "@/hooks/usePageAccess";
import { formatFeePercent } from "@/lib/fee";
import { DEFAULT_MGMT_FRACTION, DEFAULT_INCENTIVE_FRACTION } from "@/lib/pm/models";

type ModalState = { mode: SubscriptionModalMode; context: SubscriptionModalContext };

type DeepLinkModel = { id: string; name: string; mgmtFee: string; incentiveFee: string };

type DeepLinkResult =
  | { kind: "none" }
  | { kind: "error"; message: string }
  | { kind: "ok"; open: { openClient: string; openModelKey: string } | null; modal: ModalState };

/** Resolve the "Request Tickets" deep-link contract: ?client=<real client_id>
 *  &model=<real model_id>&mode=<add-allotment|redemption>&ticket=<ref>&multiplier=<n>.
 *  - Held model → the requested locked mode, against the live subscription.
 *  - Allotment into a model the client doesn't hold yet → New Subscription,
 *    pre-filled, still carrying the ticket ref so the ticket is linked (D21).
 *  - Anything else that came from a ticket → an error, never a silent drop. */
function resolveDeepLink(
  params: URLSearchParams,
  clients: SubClient[],
  liveModels: DeepLinkModel[],
): DeepLinkResult {
  const modeParam = params.get("mode");
  if (modeParam !== "add-allotment" && modeParam !== "redemption") return { kind: "none" };
  const clientId = params.get("client");
  const modelId = params.get("model");
  const ticket = params.get("ticket") ?? undefined;
  // The ticket's requested multiplier pre-fills the form; redemptions arrive signed.
  const mult = Math.abs(Number(params.get("multiplier")));
  const multiplier = Number.isFinite(mult) && mult > 0 ? mult : undefined;
  const fail = (message: string): DeepLinkResult => (ticket ? { kind: "error", message } : { kind: "none" });
  if (!clientId || !modelId) return fail(`Couldn't open request ${ticket}: it has no client or model.`);

  const client = clients.find((c) => c.id === clientId);
  const modelIdx = client ? client.models.findIndex((m) => m.modelId === modelId) : -1;
  const held = client && modelIdx !== -1 ? client.models[modelIdx] : undefined;

  if (client && held) {
    return {
      kind: "ok",
      open: { openClient: client.id, openModelKey: `${client.id}-${modelIdx}` },
      modal: {
        mode: modeParam,
        context: {
          clientName: client.name,
          clientId: client.id,
          modelName: held.name,
          modelId: held.modelId,
          modelSize: held.modelSize,
          modelAccount: held.account,
          mgmtFee: held.mgmtFee,
          incentiveFee: held.incentiveFee,
          multiplier,
          sourceTicketRef: ticket,
        },
      },
    };
  }

  if (modeParam === "redemption") {
    return fail(`Couldn't open request ${ticket}: the client doesn't hold this model, so there is nothing to redeem.`);
  }

  const live = liveModels.find((m) => m.id === modelId);
  if (!live) return fail(`Couldn't open request ${ticket}: the requested model is not live.`);
  return {
    kind: "ok",
    open: client ? { openClient: client.id, openModelKey: "" } : null,
    modal: {
      mode: "new-subscription",
      context: {
        clientId,
        modelId: live.id,
        modelName: live.name,
        mgmtFee: live.mgmtFee,
        incentiveFee: live.incentiveFee,
        multiplier,
        sourceTicketRef: ticket,
      },
    },
  };
}

function ModelSubscriptionContent() {
  const searchParams = useSearchParams();
  const { clients, ensureAllotmentsLoaded, refetch, invalidateClientAllotments } = useSubscriptions();
  const { data: models } = useModels();
  // Full client roster (not just clients with an existing subscription) so a
  // fully-redeemed or brand-new client can still be picked for New Subscription.
  const { data: clientBook } = useClientBook();
  const { data: board } = useOnboardingBoard();
  const [deepLink, setDeepLink] = useState<{ openClient: string; openModelKey: string } | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const deepLinkApplied = useRef(false);
  const canEdit = useCanEdit("rm.model-subscription");


  const totalClients = clients?.length ?? 0;
  const totalModels = clients?.reduce((s, c) => s + c.models.length, 0) ?? 0;

  // Only a client still in their FIRST onboarding (kind "initial", not yet
  // active) is held back. A renewal or reprovision also moves an approved
  // client off "active", but they stay subscribable. A client absent from the
  // board entirely is legacy or fully onboarded, so keep them — same fallback
  // client-info/page.tsx uses for the same board-overlay gap.
  const nonActiveUserIds = new Set(
    (board ?? [])
      .filter((col) => col.status !== "active")
      .flatMap((col) => col.clients.filter((c) => c.kind !== "renewal").map((c) => c.userId)),
  );
  const availableClients = (clientBook ?? [])
    .filter((c) => !nonActiveUserIds.has(c.id))
    .map((c) => ({ id: c.id, name: c.name ?? "—" }));

  // Every model a client already holds (any multiplier > 0) — sourced from the
  // subscriptions payload already loaded for the accordion, no extra fetch.
  const subscribedModelIdsByClient: Record<string, Set<string>> = {};
  (clients ?? []).forEach((c) => {
    subscribedModelIdsByClient[c.id] = new Set(c.models.map((m) => m.modelId));
  });

  const availableModels = (models ?? [])
    .filter((m) => m.status === "live")
    .map((m) => ({
      id: m.id, name: m.name, size: m.size,
      mgmtFee: formatFeePercent(m.mgmt_fee ?? DEFAULT_MGMT_FRACTION),
      incentiveFee: formatFeePercent(m.incentive_fee ?? DEFAULT_INCENTIVE_FRACTION),
    }));

  // Wait for subscriptions, models and the client book: a new-subscription
  // fallback needs all three to pre-fill its selects.
  const deepLinkReady = !!clients && !!models && !!clientBook;
  useEffect(() => {
    if (deepLinkApplied.current || !deepLinkReady || !clients) return;
    deepLinkApplied.current = true;
    const resolved = resolveDeepLink(searchParams, clients, availableModels);
    if (resolved.kind === "error") { toast.error(resolved.message); return; }
    if (resolved.kind !== "ok") return;
    if (resolved.open) setDeepLink(resolved.open);
    if (canEdit) setModal(resolved.modal);
    else toast.error("Access Denied: You have no access right to this component");
  }, [deepLinkReady, clients, availableModels, searchParams, canEdit]);

  return (
    <div className="mx-auto">
      <div className="mb-7">
        <PageHeader
          title="Model Subscription"
          subtitle={`Client book → subscribed models → full transaction history. ${totalClients} clients · ${totalModels} subscriptions.`}
          actions={
            /* View/Edit Gate Function */
            canEdit && (
              <Button icon={Plus} onClick={() => setModal({ mode: "new-subscription", context: {} })}>
                Subscribe Client
              </Button>
            )
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
          subscribedModelIdsByClient={subscribedModelIdsByClient}
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
