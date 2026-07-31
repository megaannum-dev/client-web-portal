"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getRecords } from "@/app/(roles)/mobo/trade-reconciliation/actions";
import type { TradeRecordsViewDTO } from "@/lib/mobo/types";

export interface UseTradeRecordsResult {
  data: TradeRecordsViewDTO | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// Module-scoped cache keyed by day token ("__latest__" for the no-date default),
// mirroring usePostTradeAllocation.
const cache = new Map<string, TradeRecordsViewDTO>();
const cacheKey = (date: string | undefined) => date ?? "__latest__";

/** `date` is a raw `YYYYMMDD` day token; omitted = the latest day with orders. */
export function useTradeRecords(date?: string): UseTradeRecordsResult {
  const [data, setData] = useState<TradeRecordsViewDTO | null>(
    () => cache.get(cacheKey(date)) ?? null,
  );
  const [loading, setLoading] = useState(!cache.has(cacheKey(date)));
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const doFetch = useCallback(async (d: string | undefined) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await getRecords(d);
      if (result.success) {
        cache.set(cacheKey(d), result.data);
        setData(result.data);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trade records");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    doFetch(date);
  }, [date, doFetch]);

  return { data, loading, error, refetch: () => doFetch(date) };
}
