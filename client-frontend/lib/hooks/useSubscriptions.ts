"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { fetchSubscriptions, type SubscriptionDTO } from "@/lib/api/onboarding";

export interface SubscribedModelView {
  name: string; symbol: string; country: string; sector: string;
  amount: string; multiplier: string; modelLimit: string; ibAccount: string;
}

function mapSubscription(dto: SubscriptionDTO): SubscribedModelView {
  return {
    name: dto.model_name,
    // out of scope for this proposal, not a dropped field: this shape is a stale,
    // prototype-era model-catalog schema the real `Model` table doesn't carry
    // (no country/sector concept, symbols are a weighted one-to-many relationship)
    // — backfilling the real schema to match a stale mock would contaminate it.
    // See proposal D-9 / Layer 3 A-4.
    symbol: "—", country: "—", sector: "—", amount: "—", modelLimit: "—",
    multiplier: `${dto.units.toFixed(1)}x`,
    ibAccount: dto.ib_account ?? "—",
  };
}

/** Mirrors useAllotmentRequests's useEffect+useState shape — this hook adds
 *  the actual network call useAllotmentRequests's TODO comment defers. */
export function useSubscriptions() {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<SubscribedModelView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken();
        const dtos = await fetchSubscriptions(token);
        if (!cancelled) setData(dtos.map(mapSubscription));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load subscriptions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [getIdToken]);

  return { data, loading, error };
}
