"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { fetchRequests, type ClientRequestDTO } from "@/lib/api/requests";

/** Same useEffect+getIdToken+fetch+refetch shape as useKyc. */
export function useRequests(): {
  data: ClientRequestDTO[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<ClientRequestDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const token = await getIdToken();
        const dtos = await fetchRequests(token);
        if (!cancelled) setData(dtos);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load requests");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // ponytail: fetch on mount + on refetch()'s version bump, not on every
    // getIdToken identity change — same intent as useKyc/useProfile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  return { data, loading, error, refetch: () => setVersion((v) => v + 1) };
}
