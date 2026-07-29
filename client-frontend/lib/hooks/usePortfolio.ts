"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { fetchPortfolio, type PortfolioDTO } from "@/lib/api/portfolio";

export function usePortfolio() {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<PortfolioDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken();
        const dto = await fetchPortfolio(token);
        if (!cancelled) setData(dto);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load portfolio");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [getIdToken]);

  return { data, loading, error };
}
