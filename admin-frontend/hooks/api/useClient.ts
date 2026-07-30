"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  getClient, updateClient as _updateClient, getOnboardingByClient as _getOnboardingByClient,
  getClientEvents as _getClientEvents,
  getContactLogs as _getContactLogs, createContactLogEntry as _createContactLogEntry,
} from "@/app/(roles)/rm/client-info/[id]/actions";
import { getCachedById } from "@/hooks/api/useClientBook";
import { dtoToRow, type ClientRow, type ClientPatchReq } from "@/lib/rm/clients";
import type { ClientEventDTO, ContactLogEntryDTO, OnboardingDTO } from "@/lib/onboarding/types";

export interface UseClientResult {
  data: ClientRow | null;
  loading: boolean;
  error: string | null;
  notFound: boolean; // separates 404 from network/other errors
  /** "Edit profile" flow -- PATCHes, then updates local state from the
   * response directly (no refetch needed, PATCH already returns the
   * updated client in the same shape as GET). */
  updateProfile: (patch: ClientPatchReq) => Promise<{ success: boolean; error?: string }>;
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
    if (!uid || inFlight.current) return;
    inFlight.current = true;
    // cacheHit (from the list endpoint) lacks single-client-only fields like
    // subscriptions — show it immediately, but still fetch the full record
    // rather than treating the cache as a substitute for that fetch.
    if (!cacheHit) setLoading(true);
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

  const updateProfile = useCallback(async (patch: ClientPatchReq) => {
    const r = await _updateClient(id, patch);
    if (!r.success) return { success: false, error: r.error };
    setData(dtoToRow(r.data));
    return { success: true };
  }, [id]);

  return { data, loading, error, notFound, updateProfile };
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

/** FE-4 — client-detail page's Contact Log card. */
export interface UseContactLogsResult {
  data: ContactLogEntryDTO[] | null;
  loading: boolean;
  error: string | null;
  createEntry: (formData: FormData) => Promise<{ success: boolean; error?: string }>;
}

export function useContactLogs(clientId: string): UseContactLogsResult {
  const [data, setData] = useState<ContactLogEntryDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const fetch_ = useCallback(async () => {
    if (!clientId || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const r = await _getContactLogs(clientId);
      if (r.success) setData(r.data);
      else if (r.code === "HTTP_404") setData([]);
      else setError(r.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load contact log");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [clientId]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const createEntry = useCallback(async (formData: FormData) => {
    const r = await _createContactLogEntry(clientId, formData);
    if (!r.success) return { success: false, error: r.error };
    await fetch_(); // refetch-after-mutate, mirrors useOnboardingBoard's start/submit
    return { success: true };
  }, [clientId, fetch_]);

  return { data, loading, error, createEntry };
}
