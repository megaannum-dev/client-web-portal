"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { fetchRecommendedModels, type RecommendedModelDTO } from "@/lib/api/models";

/** Mirrors useSubscriptions's useEffect+useState shape. */
export function useRecommendedModels(includeSubscribed = false) {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<RecommendedModelDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken();
        const dtos = await fetchRecommendedModels(token, includeSubscribed);
        if (!cancelled) setData(dtos);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load recommended models");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [getIdToken, includeSubscribed]);

  return { data, loading, error };
}
