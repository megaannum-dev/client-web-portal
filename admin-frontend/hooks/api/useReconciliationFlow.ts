"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getFlow } from "@/app/(roles)/mobo/trade-reconciliation/actions";
import { mapDtoToReconciliationFlow } from "@/lib/mobo/reconciliation-flow";
import type { ReconciliationFlowView } from "@/lib/mobo/flow-types";

export interface UseReconciliationFlowResult {
  data: ReconciliationFlowView | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const cache = new Map<string, ReconciliationFlowView>();
const cacheKey = (sessionId: string | undefined) => sessionId ?? "__latest__";

export function useReconciliationFlow(sessionId?: string): UseReconciliationFlowResult {
  const [data, setData] = useState<ReconciliationFlowView | null>(
    () => cache.get(cacheKey(sessionId)) ?? null,
  );
  const [loading, setLoading] = useState(!cache.has(cacheKey(sessionId)));
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const doFetch = useCallback(async (id: string | undefined) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await getFlow(id);
      if (result.success) {
        const view = mapDtoToReconciliationFlow(result.data);
        cache.set(cacheKey(id), view);
        setData(view);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reconciliation flow");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => { doFetch(sessionId); }, [sessionId, doFetch]);

  return { data, loading, error, refetch: () => doFetch(sessionId) };
}
