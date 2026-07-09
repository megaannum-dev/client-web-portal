"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getClient } from "@/app/(roles)/rm/client-info/[id]/actions";
import { getCachedById } from "@/hooks/api/useClientBook";
import { dtoToRow, type ClientRow } from "@/lib/rm/clients";

export interface UseClientResult {
  data: ClientRow | null;
  loading: boolean;
  error: string | null;
  notFound: boolean; // separates 404 from network/other errors
}

export function useClient(id: string): UseClientResult {
  const uid = useAuth().portalUser?.firebase_uid ?? null;
  const cacheHit = getCachedById(uid, id);

  const [data, setData] = useState<ClientRow | null>(cacheHit);
  const [loading, setLoading] = useState<boolean>(!cacheHit);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (cacheHit) { setData(cacheHit); setLoading(false); return; }
    if (!uid || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    setNotFound(false);
    (async () => {
      try {
        const r = await getClient(id);
        if (r.success) {
          setData(dtoToRow(r.data));
        } else if (r.code === "HTTP_404") {
          setNotFound(true);
        } else {
          setError(r.error);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load client");
      } finally {
        setLoading(false);
        inFlight.current = false;
      }
    })();
  }, [id, uid, cacheHit]);

  return { data, loading, error, notFound };
}
