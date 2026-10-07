"use client";

// Cross-room document list for the Client Correspondents page. Keyset-paged:
// filters change => reset to page 1; loadMore appends the next page.

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  fetchChatDocumentSenders,
  fetchChatDocuments,
  type ChatDocumentDTO,
  type ChatDocumentParams,
  type ChatDocumentSender,
} from "@/lib/api/chat";

/** Everything except paging, which the hook owns. */
export type ChatDocumentFilters = Omit<ChatDocumentParams, "cursor">;

export interface UseChatDocuments {
  docs: ChatDocumentDTO[];
  total: number;
  loading: boolean; // first page of the current filters
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
}

export function useChatDocuments(filters: ChatDocumentFilters): UseChatDocuments {
  const { getIdToken } = useAuth();
  const getTokenRef = useRef(getIdToken);
  getTokenRef.current = getIdToken;

  const [docs, setDocs] = useState<ChatDocumentDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);

  // Latest request wins: a response whose id is no longer current is dropped.
  const reqId = useRef(0);
  const inFlight = useRef(false);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const key = JSON.stringify(filters);

  const run = useCallback(async (after: string | null) => {
    const id = ++reqId.current;
    inFlight.current = true;
    if (after) setLoadingMore(true);
    else { setLoading(true); setDocs([]); setCursor(null); }
    setError(null);
    try {
      const page = await fetchChatDocuments(await getTokenRef.current(), { ...filtersRef.current, cursor: after });
      if (id !== reqId.current) return;
      setDocs((prev) => (after ? [...prev, ...page.items] : page.items));
      setTotal(page.total);
      setCursor(page.next_cursor);
    } catch (err) {
      if (id !== reqId.current) return;
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      if (id === reqId.current) {
        inFlight.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => { void run(null); }, [key, run]);

  const loadMore = useCallback(() => {
    // While errored, stay put: otherwise the page's observer re-fires at once and the failure loops.
    if (inFlight.current || !cursor || error) return;
    void run(cursor);
  }, [cursor, error, run]);

  // Explicit user retry; run() clears the error. A failed first page has no cursor, so reload it.
  const retry = useCallback(() => {
    if (inFlight.current) return;
    void run(cursor);
  }, [cursor, run]);

  return { docs, total, loading, loadingMore, error, hasMore: cursor != null, loadMore, retry };
}

export function useChatDocumentSenders(): { senders: ChatDocumentSender[]; loading: boolean; error: string | null } {
  const { getIdToken } = useAuth();
  const getTokenRef = useRef(getIdToken);
  getTokenRef.current = getIdToken;
  const [senders, setSenders] = useState<ChatDocumentSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const s = await fetchChatDocumentSenders(await getTokenRef.current());
        if (live) setSenders(s);
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : "Failed to load senders");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, []);

  return { senders, loading, error };
}
