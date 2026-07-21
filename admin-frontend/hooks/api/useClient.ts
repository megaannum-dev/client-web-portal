"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getClient, getOnboardingByClient as _getOnboardingByClient, getClientEvents as _getClientEvents } from "@/app/(roles)/rm/client-info/[id]/actions";
import { getCachedById } from "@/hooks/api/useClientBook";
import { dtoToRow, type ClientRow } from "@/lib/rm/clients";
import type { ClientEventDTO, OnboardingDTO } from "@/lib/onboarding/types";

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

/** FE-4 — client-detail page's KYC & Documents card. 404 (no onboarding row
 *  yet, e.g. a pre-013 client) is treated as `data: null`, not an error. */
export interface UseOnboardingByClientResult {
  data: OnboardingDTO | null;
  loading: boolean;
  error: string | null;
}

export function useOnboardingByClient(clientId: string): UseOnboardingByClientResult {
  const [data, setData] = useState<OnboardingDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!clientId || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const r = await _getOnboardingByClient(clientId);
        if (r.success) setData(r.data);
        else if (r.code === "HTTP_404") setData(null);
        else setError(r.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load onboarding");
      } finally {
        setLoading(false);
        inFlight.current = false;
      }
    })();
  }, [clientId]);

  return { data, loading, error };
}

/** FE-4 — client-detail page's History card. */
export interface UseClientEventsResult {
  data: ClientEventDTO[] | null;
  loading: boolean;
  error: string | null;
}

export function useClientEvents(clientId: string): UseClientEventsResult {
  const [data, setData] = useState<ClientEventDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!clientId || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const r = await _getClientEvents(clientId);
        if (r.success) setData(r.data);
        else if (r.code === "HTTP_404") setData(null);
        else setError(r.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load client history");
      } finally {
        setLoading(false);
        inFlight.current = false;
      }
    })();
  }, [clientId]);

  return { data, loading, error };
}
