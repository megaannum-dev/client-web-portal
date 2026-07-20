"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAllotments, acknowledgeAllotment } from "@/app/(roles)/pc/allotment-redemption/actions";
import { mapAllotmentsToView } from "@/lib/onboarding/mappers";
import type { AllotmentView } from "@/lib/onboarding/types";

export interface UseAllotmentsResult {
  data: AllotmentView[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  acknowledge: (id: string) => Promise<{ success: boolean; error?: string }>;
}

export function useAllotments(): UseAllotmentsResult {
  const [data, setData] = useState<AllotmentView[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const fetch_ = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAllotments();
      if (result.success) setData(mapAllotmentsToView(result.data));
      else setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load allotments");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const acknowledge = useCallback(async (id: string) => {
    const result = await acknowledgeAllotment(id);
    if (result.success) fetch_();
    return { success: result.success, error: result.success ? undefined : result.error };
  }, [fetch_]);

  return { data, loading, error, refetch: fetch_, acknowledge };
}
