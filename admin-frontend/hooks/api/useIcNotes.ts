"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listIcNotesAction } from "@/app/(roles)/compliance/ic-notes/actions";
import type { IcNoteDTO } from "@/lib/ic-notes/types";

export interface UseIcNotesResult {
  notes: IcNoteDTO[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useIcNotes(): UseIcNotesResult {
  const [notes, setNotes] = useState<IcNoteDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const fetch_ = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await listIcNotesAction();
      if (result.success) setNotes(result.data);
      else setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load IC notes");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { notes, loading, error, refetch: fetch_ };
}
