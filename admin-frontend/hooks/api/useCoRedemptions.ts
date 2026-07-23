"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCoRedemptions, coDecideRedemption } from "@/app/(roles)/compliance/review/actions";
import { mapRedemptionsToView } from "@/lib/onboarding/mappers";
import type { AllotRdmptDTO, RedemptionDecisionReq, RedemptionView } from "@/lib/onboarding/types";

export interface UseCoRedemptionsResult {
  data: RedemptionView[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  decide: (id: string, body: RedemptionDecisionReq) => Promise<{ success: boolean; error?: string }>;
}

export function useCoRedemptions(): UseCoRedemptionsResult {
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
      const result = await fetchCoRedemptions();
      if (result.success) setRaw(result.data);
      else setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load redemptions");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const data = raw ? mapRedemptionsToView(raw) : null;

  const decide = useCallback(async (id: string, body: RedemptionDecisionReq) => {
    const result = await coDecideRedemption(id, body);
    if (result.success) fetch_();
    return { success: result.success, error: result.success ? undefined : result.error };
  }, [fetch_]);

  return { data, loading, error, refetch: fetch_, decide };
}
