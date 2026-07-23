"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSubscriptions, fetchClientAllotments } from "@/app/(roles)/rm/model-subscription/actions";
import { mapSubscriptionsToSubClients } from "@/lib/rm/subscriptions";
import type { ClientSubscriptionsDTO, AllotRdmptDTO } from "@/lib/onboarding/types";
import type { SubClient } from "@/lib/mock/rm-data";

export interface UseSubscriptionsResult {
  clients: SubClient[] | null;
  loading: boolean;
  error: string | null;
  /** Triggers the per-client allotment fetch at most once per client id
   *  (idempotent no-op if already cached or in flight) — called when a
   *  client's accordion section is opened, not eagerly for every client
   *  up front (that would be one request per row on page load). */
  ensureAllotmentsLoaded: (clientId: string) => void;
  /** Re-fetch subscriptions (Net rows, aggregates). */
  refetch: () => void;
  /** Force-refresh one client's ledger, bypassing the cache. */
  invalidateClientAllotments: (clientId: string) => void;
}

export function useSubscriptions(): UseSubscriptionsResult {
  const [dtos, setDtos] = useState<ClientSubscriptionsDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allotmentsByClient, setAllotmentsByClient] = useState<Record<string, AllotRdmptDTO[]>>({});
  const inFlight = useRef(new Set<string>());

  const loadSubscriptions = useCallback(() => {
    fetchSubscriptions().then((r) => (r.success ? setDtos(r.data) : setError(r.error)));
  }, []);

  useEffect(loadSubscriptions, [loadSubscriptions]);

  const loadAllotments = useCallback((clientId: string) => {
    inFlight.current.add(clientId);
    fetchClientAllotments(clientId).then((r) => {
      inFlight.current.delete(clientId);
      if (r.success) setAllotmentsByClient((m) => ({ ...m, [clientId]: r.data }));
    });
  }, []);

  const ensureAllotmentsLoaded = useCallback((clientId: string) => {
    if (allotmentsByClient[clientId] !== undefined || inFlight.current.has(clientId)) return;
    loadAllotments(clientId);
  }, [allotmentsByClient, loadAllotments]);

  const invalidateClientAllotments = useCallback((clientId: string) => {
    loadAllotments(clientId); // unconditional re-fetch, overwrites the cached entry on success
  }, [loadAllotments]);

  return {
    clients: dtos ? mapSubscriptionsToSubClients(dtos, allotmentsByClient) : null,
    loading: dtos === null && !error,
    error,
    ensureAllotmentsLoaded,
    refetch: loadSubscriptions,
    invalidateClientAllotments,
  };
}
