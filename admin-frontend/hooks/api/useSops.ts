"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listSopsAction } from "@/app/(roles)/compliance/sop/actions";
import type { SopDocumentDTO } from "@/lib/sop/types";

export interface UseSopsResult {
  sops: SopDocumentDTO[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useSops(): UseSopsResult {
  const [sops, setSops] = useState<SopDocumentDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const fetch_ = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await listSopsAction();
      if (result.success) setSops(result.data);
      else setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SOPs");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { sops, loading, error, refetch: fetch_ };
}
