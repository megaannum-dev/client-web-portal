"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAllotments, acknowledgeAllotment, pcDecideRedemption } from "@/app/(roles)/pc/allotment-redemption/actions";
import { mapAllotmentsToView, mapRedemptionsToView } from "@/lib/onboarding/mappers";
import type { AllotmentView, AllotRdmptDTO, RedemptionView, RedemptionDecisionReq } from "@/lib/onboarding/types";

export interface UseAllotmentsResult {
  data: AllotmentView[] | null;
  redemptions: RedemptionView[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  acknowledge: (id: string) => Promise<{ success: boolean; error?: string }>;
  decideRedemption: (id: string, body: RedemptionDecisionReq) =>
    Promise<{ success: boolean; error?: string }>;
}

export function useAllotments(): UseAllotmentsResult {
  const [raw, setRaw] = useState<AllotRdmptDTO[] | null>(null);
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
      if (result.success) setRaw(result.data);
      else setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load allotments");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const data = raw ? mapAllotmentsToView(raw) : null;
  const redemptions = raw ? mapRedemptionsToView(raw) : null;

  const acknowledge = useCallback(async (id: string) => {
    const result = await acknowledgeAllotment(id);
    if (result.success) fetch_();
    return { success: result.success, error: result.success ? undefined : result.error };
  }, [fetch_]);

  const decideRedemption = useCallback(async (id: string, body: RedemptionDecisionReq) => {
    const result = await pcDecideRedemption(id, body);
    if (result.success) fetch_();
    return { success: result.success, error: result.success ? undefined : result.error };
  }, [fetch_]);

  return { data, redemptions, loading, error, refetch: fetch_, acknowledge, decideRedemption };
}
