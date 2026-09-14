"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getExecutionsView } from "@/app/(roles)/mobo/trade-reconciliation/actions";
import type { UnifiedExecutionsViewDTO } from "@/lib/mobo/executions";

export interface UseExecutionsResult {
  data: UnifiedExecutionsViewDTO | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// Module-scoped cache keyed by day ("__latest__" for the no-day default),
// mirroring useTradeRecords.
const cache = new Map<string, UnifiedExecutionsViewDTO>();
const cacheKey = (day: string | undefined) => day ?? "__latest__";

/** `day` is an ISO `YYYY-MM-DD` date; omitted = the latest day present. */
export function useExecutions(day?: string): UseExecutionsResult {
  const [data, setData] = useState<UnifiedExecutionsViewDTO | null>(
    () => cache.get(cacheKey(day)) ?? null,
  );
  const [loading, setLoading] = useState(!cache.has(cacheKey(day)));
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const doFetch = useCallback(async (d: string | undefined) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await getExecutionsView(d);
      if (result.success) {
        cache.set(cacheKey(d), result.data);
        setData(result.data);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load executions");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    doFetch(day);
  }, [day, doFetch]);

  return { data, loading, error, refetch: () => doFetch(day) };
}
