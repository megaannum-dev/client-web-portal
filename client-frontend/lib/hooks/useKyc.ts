"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { fetchKycPanel, uploadKycDocument, type KycPanelDTO } from "@/lib/api/kyc";

/** Same useEffect+getIdToken+fetch shape as useSubscriptions/useProfile, plus an
 *  upload() for the multipart round-trip and a refetch() to reload after it. */
export function useKyc(): {
  data: KycPanelDTO | null;
  loading: boolean;
  error: string | null;
  upload: (file: File) => Promise<{ ok: true } | { ok: false; error: string }>;
  refetch: () => void;
} {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<KycPanelDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const token = await getIdToken();
        const dto = await fetchKycPanel(token);
        if (!cancelled) setData(dto);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load KYC panel");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // ponytail: fetch on mount + on refetch()'s version bump, not on every
    // getIdToken identity change — same intent as useProfile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  async function upload(file: File): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!data?.renewal_doc_type) return { ok: false, error: "No document type to upload" };
    try {
      const token = await getIdToken();
      await uploadKycDocument(token, data.renewal_doc_type, file);
      setVersion((v) => v + 1);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to upload document";
      setError(message);
      return { ok: false, error: message };
    }
  }

  return { data, loading, error, upload, refetch: () => setVersion((v) => v + 1) };
}
