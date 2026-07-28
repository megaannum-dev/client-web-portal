"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { fetchProfile, patchProfile, type ClientProfileDTO, type ClientProfilePatch } from "@/lib/api/profile";

/** Same useEffect+getIdToken+fetch shape as useSubscriptions, plus a save() for the PATCH round-trip. */
export function useProfile(): {
  data: ClientProfileDTO | null;
  loading: boolean;
  error: string | null;
  save: (patch: ClientProfilePatch) => Promise<{ ok: true } | { ok: false; error: string }>;
} {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<ClientProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken();
        const dto = await fetchProfile(token);
        if (!cancelled) setData(dto);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // ponytail: fetch once on mount, not on every getIdToken identity change —
    // matches useSubscriptions's intent (a stable useCallback in real
    // AuthProvider) without depending on an unstable value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(patch: ClientProfilePatch): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const token = await getIdToken();
      const updated = await patchProfile(token, patch);
      setData(updated);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save profile";
      setError(message);
      return { ok: false, error: message };
    }
  }

  return { data, loading, error, save };
}
