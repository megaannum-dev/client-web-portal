"use client";

import { useEffect, useState } from "react";
import { STORE_KEYS, type LatestEvent } from "@/lib/mock/data";

export type { ActionLevel } from "@/lib/mock/data";

// TODO: replace localStorage reads with GET /api/client/latest-events
export function useLatestEvents(): LatestEvent[] {
  const [events, setEvents] = useState<LatestEvent[]>([]);

  useEffect(() => {
    const stored: LatestEvent[] = JSON.parse(
      localStorage.getItem(STORE_KEYS.latestEvents) ?? "[]",
    );
    setEvents(stored);
  }, []);

  return events;
}
