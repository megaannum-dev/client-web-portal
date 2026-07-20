"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getView, getRuns, runSync, getHistory } from "@/app/(roles)/mobo/post-trade-allocation/actions";
import { mapDtoToPostTradeAllocation, mapDtoToRuns } from "@/lib/mobo/allocation";
import type { PostTradeAllocationView, PtaRun, PtaHistoryEntry } from "@/lib/mobo/types";

export interface UsePostTradeAllocationResult {
  data: PostTradeAllocationView | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  /** Manual "Sync" trigger — always safe to re-click (§4.1 idempotent no-op). */
  sync: () => Promise<{ empty: boolean; checkedAt?: string; error?: string }>;
}

// Module-scoped cache shared across hook instances, keyed by trade date
// ("__latest__" for the no-date default) — mirrors useAllocation's period cache.
const cache = new Map<string, PostTradeAllocationView>();
const cacheKey = (date: string | undefined) => date ?? "__latest__";

export function usePostTradeAllocation(date?: string): UsePostTradeAllocationResult {
  const [data, setData] = useState<PostTradeAllocationView | null>(
    () => cache.get(cacheKey(date)) ?? null,
  );
  const [loading, setLoading] = useState(!cache.has(cacheKey(date)));
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const dateRef = useRef(date);

  const doFetch = useCallback(async (d: string | undefined) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await getView(d);
      if (result.success) {
        const view = mapDtoToPostTradeAllocation(result.data);
        cache.set(cacheKey(d), view);
        setData(view);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load allocation");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    dateRef.current = date;
    doFetch(date);
  }, [date, doFetch]);

  // Refetch on window refocus — new orders / a scheduled run may have landed.
  useEffect(() => {
    const onFocus = () => { if (!document.hidden) doFetch(dateRef.current); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [doFetch]);

  const doSync = useCallback(async () => {
    const result = await runSync();
    if (!result.success) return { empty: false, error: result.error };
    cache.delete(cacheKey(dateRef.current));
    await doFetch(dateRef.current);
    const empty = result.data.latest.models.length === 0;
    return { empty, checkedAt: result.data.checkedAt };
  }, [doFetch]);

  return { data, loading, error, refetch: () => doFetch(date), sync: doSync };
}

/** Sibling hook for the DateControl dropdown — feeds it from /runs instead of PTA_DISCRETE_DATES. */
export function usePostTradeAllocationRuns(): { runs: PtaRun[]; loading: boolean } {
  const [runs, setRuns] = useState<PtaRun[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getRuns().then((result) => {
      if (result.success) setRuns(mapDtoToRuns(result.data));
      setLoading(false);
    });
  }, []);
  return { runs, loading };
}

export function usePostTradeAllocationHistory(
  fromDate: string | null,
  toDate: string | null,
  modelId?: string,
): { series: PtaHistoryEntry[]; loading: boolean } {
  const [series, setSeries] = useState<PtaHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    getHistory(fromDate, toDate, modelId).then((result) => {
      if (result.success) setSeries(result.data.series);
      setLoading(false);
    });
  }, [fromDate, toDate, modelId]);
  return { series, loading };
}
