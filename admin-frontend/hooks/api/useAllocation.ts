"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAllocation } from "@/app/(roles)/pc/allocation-matrix/actions";
import { mapDtoToAllocationView, type AllocationView } from "@/lib/pc/allocation";

export interface UseAllocationResult {
  data: AllocationView | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

interface CacheEntry {
  view: AllocationView;
  etag: string;
}

// Module-scoped cache shared across hook instances for the same session.
const cache = new Map<string, CacheEntry>();

function cacheKey(period: string | undefined): string {
  return period ?? "__open__";
}

export function useAllocation(period?: string): UseAllocationResult {
  const [data, setData] = useState<AllocationView | null>(() => {
    const hit = cache.get(cacheKey(period));
    return hit?.view ?? null;
  });
  const [loading, setLoading] = useState(!cache.has(cacheKey(period)));
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const periodRef = useRef(period);

  const doFetch = useCallback(async (p: string | undefined) => {
    if (inFlight.current) return;
    inFlight.current = true;

    const key = cacheKey(p);
    const cached = cache.get(key);

    // Confirmed (non-open) periods: once cached their ETag never changes.
    // Skip the network round-trip entirely.
    if (cached) {
      const periodStatus = cached.view.periods.find(
        (per) => per.label === (p ?? cached.view.openPeriod),
      )?.status;
      if (periodStatus === "confirmed") {
        setData(cached.view);
        setLoading(false);
        inFlight.current = false;
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const { result, etag, notModified } = await getAllocation(p, cached?.etag);

      if (notModified && cached) {
        // 304: nothing changed — keep cached view, no re-render churn.
        setData(cached.view);
      } else if (result.success) {
        const view = mapDtoToAllocationView(result.data);
        cache.set(key, { view, etag: etag ?? "" });
        setData(view);
      } else if (result.code !== "NOT_MODIFIED") {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load allocation");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  // Refetch on mount and when period changes.
  useEffect(() => {
    periodRef.current = period;
    doFetch(period);
  }, [period, doFetch]);

  // Refetch on window refocus (stale-while-revalidate via ETag).
  useEffect(() => {
    const onFocus = () => {
      if (!document.hidden) doFetch(periodRef.current);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [doFetch]);

  return { data, loading, error, refetch: () => doFetch(period) };
}
