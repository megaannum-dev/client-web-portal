"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchBoard, startOnboarding, uploadDocument, submitAll, fetchRmOptions, fetchDocSpecs, fetchOnboarding } from "@/app/(roles)/rm/onboarding-renewal/actions";
import { mapBoardToColumns, mapRow } from "@/lib/onboarding/mappers";
import type { DocSpecDTO, KycBoardClient, KycBoardColumn, RmOptionDTO, StartOnboardingReq } from "@/lib/onboarding/types";

export interface UseOnboardingBoardResult {
  data: KycBoardColumn[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  startOnboarding: (body: StartOnboardingReq) => Promise<{ success: boolean; error?: string; id?: string }>;
  uploadDocument: (onboardingId: string, docType: string, file: File) => Promise<{ success: boolean; error?: string }>;
  submitAll: (onboardingId: string) => Promise<{ success: boolean; error?: string }>;
  fetchRmOptions: () => Promise<{ success: boolean; error?: string; data?: RmOptionDTO[] }>;
  fetchDocSpecs: () => Promise<{ success: boolean; error?: string; data?: DocSpecDTO[] }>;
  fetchOnboarding: (onboardingId: string) => Promise<{ success: boolean; error?: string; data?: KycBoardClient }>;
}

export function useOnboardingBoard(): UseOnboardingBoardResult {
  const [data, setData] = useState<KycBoardColumn[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const fetch_ = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchBoard();
      if (result.success) setData(mapBoardToColumns(result.data));
      else setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load onboarding board");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const start = useCallback(async (body: StartOnboardingReq) => {
    const result = await startOnboarding(body);
    if (!result.success) return { success: false, error: result.error };
    fetch_();
    return { success: true, id: result.data.id };
  }, [fetch_]);

  const upload = useCallback(async (onboardingId: string, docType: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file, file.name);
    const result = await uploadDocument(onboardingId, docType, fd);
    if (result.success) fetch_();
    return { success: result.success, error: result.success ? undefined : result.error };
  }, [fetch_]);

  const submit = useCallback(async (onboardingId: string) => {
    const result = await submitAll(onboardingId);
    if (result.success) fetch_();
    return { success: result.success, error: result.success ? undefined : result.error };
  }, [fetch_]);

  const rmOptions = useCallback(async () => {
    const result = await fetchRmOptions();
    return result.success ? { success: true, data: result.data } : { success: false, error: result.error };
  }, []);

  const docSpecs = useCallback(async () => {
    const result = await fetchDocSpecs();
    return result.success ? { success: true, data: result.data } : { success: false, error: result.error };
  }, []);

  const onboarding = useCallback(async (onboardingId: string) => {
    const result = await fetchOnboarding(onboardingId);
    return result.success ? { success: true, data: mapRow(result.data) } : { success: false, error: result.error };
  }, []);

  return {
    data, loading, error, refetch: fetch_, startOnboarding: start, uploadDocument: upload, submitAll: submit,
    fetchRmOptions: rmOptions, fetchDocSpecs: docSpecs, fetchOnboarding: onboarding,
  };
}
