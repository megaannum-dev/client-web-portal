"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getTicket, getTickets } from "@/app/(roles)/rm/requests/actions";
import { mapDtoToRequestTicket } from "@/lib/rm/tickets";
import type { RequestTicket } from "@/lib/mock/rm-data";

export interface UseRmTicketsResult {
  data: RequestTicket[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useRmTickets(): UseRmTicketsResult {
  const [data, setData] = useState<RequestTicket[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const fetch = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await getTickets();
      if (result.success) {
        setData(result.data.map(mapDtoToRequestTicket));
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load request tickets");
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

export interface UseRmTicketResult {
  data: RequestTicket | null;
  loading: boolean;
  error: string | null;
}

export function useRmTicket(ref: string): UseRmTicketResult {
  const [data, setData] = useState<RequestTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    getTicket(ref)
      .then((result) => {
        if (cancelled) return;
        if (result.success) {
          setData(mapDtoToRequestTicket(result.data));
        } else if (result.code !== "HTTP_404") {
          // 404 leaves both data and error null so the page's
          // `!loading && !ticket && !error` check triggers notFound().
          setError(result.error);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load request ticket");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ref]);

  return { data, loading, error };
}
