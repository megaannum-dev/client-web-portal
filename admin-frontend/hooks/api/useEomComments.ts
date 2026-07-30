"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchEomComments, saveEomComment } from "@/app/(shared)/monthly-reports/actions";
import { mapEomCommentsToRecord } from "@/lib/eom-comments/mappers";
import type { EomCommentView, EomReportCommentDTO } from "@/lib/eom-comments/types";

export interface UseEomCommentsResult {
  data: Record<string, EomCommentView> | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  saveComment: (reportName: string, comment: string) => Promise<{ success: boolean; error?: string }>;
}

export function useEomComments(): UseEomCommentsResult {
  const [raw, setRaw] = useState<EomReportCommentDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const fetch_ = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchEomComments();
      if (result.success) setRaw(result.data);
      else setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load EoM comments");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const data = raw ? mapEomCommentsToRecord(raw) : null;

  const saveComment = useCallback(async (reportName: string, comment: string) => {
    const result = await saveEomComment(reportName, comment);
    if (result.success) fetch_();
    return { success: result.success, error: result.success ? undefined : result.error };
  }, [fetch_]);

  return { data, loading, error, refetch: fetch_, saveComment };
}
