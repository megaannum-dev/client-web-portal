"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchComplianceQueue, submitVerdict, approveOnboarding, rejectOnboarding, downloadDocument,
} from "@/app/(roles)/compliance/review/actions";
import { mapOnboardingToRow } from "@/lib/onboarding/mappers";
import type { AdminOnboardingRow } from "@/lib/onboarding/types";

export interface UseComplianceQueueResult {
  data: AdminOnboardingRow[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  submitVerdict: (id: string, docType: string, verdict: "valid" | "issue", note?: string) => Promise<{ success: boolean; error?: string }>;
  approve: (id: string) => Promise<{ success: boolean; error?: string }>;
  reject: (id: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  download: (id: string, docType: string) => Promise<{ success: boolean; error?: string; filename?: string; contentType?: string; base64?: string }>;
}

export function useComplianceQueue(): UseComplianceQueueResult {
  const [data, setData] = useState<AdminOnboardingRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const fetch_ = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchComplianceQueue();
      if (result.success) setData(result.data.map(mapOnboardingToRow));
      else setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load compliance queue");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const doVerdict = useCallback(async (id: string, docType: string, verdict: "valid" | "issue", note?: string) => {
    const result = await submitVerdict(id, docType, { verdict, note });
    if (result.success) fetch_();
    return { success: result.success, error: result.success ? undefined : result.error };
  }, [fetch_]);

  const approve = useCallback(async (id: string) => {
    const result = await approveOnboarding(id);
    if (result.success) fetch_();
    return { success: result.success, error: result.success ? undefined : result.error };
  }, [fetch_]);

  const reject = useCallback(async (id: string, reason: string) => {
    const result = await rejectOnboarding(id, { reason });
    if (result.success) fetch_();
    return { success: result.success, error: result.success ? undefined : result.error };
  }, [fetch_]);

  const download = useCallback(async (id: string, docType: string) => {
    const result = await downloadDocument(id, docType);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, ...result.data };
  }, []);

  return { data, loading, error, refetch: fetch_, submitVerdict: doVerdict, approve, reject, download };
}
