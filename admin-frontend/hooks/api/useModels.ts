"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getModels } from "@/app/(roles)/pc/model-management/actions";
import { mapDtoToModels } from "@/lib/pc/models";
import type { Model } from "@/lib/pc/types";

export interface UseModelsResult {
  data: Model[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useModels(): UseModelsResult {
  const [data, setData] = useState<Model[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const fetch = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await getModels();
      if (result.success) {
        setData(mapDtoToModels(result.data));
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load models");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}
