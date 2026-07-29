"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { fetchPortfolioHistory, type HistoryPointDTO } from "@/lib/api/portfolio";

export function usePortfolioHistory(months?: number) {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<HistoryPointDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken();
        const dtos = await fetchPortfolioHistory(token, months);
        if (!cancelled) setData(dtos);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load portfolio history");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [getIdToken, months]);

  return { data, loading, error };
}
