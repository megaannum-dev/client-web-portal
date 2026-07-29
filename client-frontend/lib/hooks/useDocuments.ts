"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { fetchDocuments, type DocumentScope, type StoredFileDTO } from "@/lib/api/documents";

/** Mirrors useSubscriptions's useEffect+useState shape. */
export function useDocuments(scope: DocumentScope) {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<StoredFileDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken();
        const dtos = await fetchDocuments(token, scope);
        if (!cancelled) setData(dtos);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load documents");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [getIdToken, scope]);

  return { data, loading, error };
}
