"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getEodReport, signOff as signOffAction } from "@/app/(roles)/mobo/daily-exception-report/actions";
import type { EodReportView } from "@/lib/mobo/eod-types";

export interface UseEodReportResult {
  data: EodReportView | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  signOff: () => Promise<boolean>;
  signingOff: boolean;
}

const cache = new Map<string, EodReportView>();
const cacheKey = (tradeDate: string | undefined) => tradeDate ?? "__default__";

export function useEodReport(tradeDate?: string): UseEodReportResult {
  const [data, setData] = useState<EodReportView | null>(() => cache.get(cacheKey(tradeDate)) ?? null);
  const [loading, setLoading] = useState(!cache.has(cacheKey(tradeDate)));
  const [error, setError] = useState<string | null>(null);
  const [signingOff, setSigningOff] = useState(false);
  const inFlight = useRef(false);

  const doFetch = useCallback(async (td: string | undefined) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await getEodReport(td);
      if (result.success) {
        cache.set(cacheKey(td), result.data);
        setData(result.data);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load EoD report");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => { doFetch(tradeDate); }, [tradeDate, doFetch]);

  const signOff = useCallback(async (): Promise<boolean> => {
    if (!data) return false;
    setSigningOff(true);
    try {
      const result = await signOffAction(data.tradeDate);
      if (result.success) {
        cache.set(cacheKey(tradeDate), result.data);
        setData(result.data);
        return true;
      }
      setError(result.error);
      return false;
    } finally {
      setSigningOff(false);
    }
  }, [data, tradeDate]);

  return { data, loading, error, refetch: () => doFetch(tradeDate), signOff, signingOff };
}
