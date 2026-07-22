"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getClients } from "@/app/(roles)/rm/client-info/actions";
import { dtoListToRows, type ClientRow } from "@/lib/rm/clients";

/** Module-scope cache — one entry per caller's firebase_uid, lives for the tab's
 *  lifetime. The backend already scoped the response by role (D-4):
 *  RM -> their own book; ADMIN -> every client. This cache doesn't need to know
 *  which — it just caches whatever the endpoint returned. */
const cache = new Map<string, ClientRow[]>();

export function getCachedById(uid: string | null, id: string): ClientRow | null {
  if (!uid) return null;
  return cache.get(uid)?.find((c) => c.id === id) ?? null;
}

/** Call after a mutation that changes which/how clients show up in the book
 *  (e.g. onboarding a new client) so the next mount re-fetches instead of
 *  serving the stale cached list. */
export function invalidateClientBook(): void {
  cache.clear();
}

export interface UseClientBookResult {
  data: ClientRow[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useClientBook(): UseClientBookResult {
  const uid = useAuth().portalUser?.firebase_uid ?? null;

  const [data, setData] = useState<ClientRow[] | null>(() =>
    uid ? cache.get(uid) ?? null : null,
  );
  const [loading, setLoading] = useState<boolean>(() => !!uid && !cache.has(uid));
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const doFetch = useCallback(async (forceRefresh = false) => {
    if (!uid || inFlight.current) return;
    if (!forceRefresh && cache.has(uid)) {
      setData(cache.get(uid) ?? null);
      setLoading(false);
      return;
    }
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const r = await getClients();
      if (r.success) {
        const rows = dtoListToRows(r.data);
        cache.set(uid, rows);
        setData(rows);
      } else {
        setError(r.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load clients");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [uid]);

  useEffect(() => { doFetch(false); }, [doFetch]);

  return { data, loading, error, refetch: () => doFetch(true) };
}
