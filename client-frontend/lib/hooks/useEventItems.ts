"use client";

import { useEffect, useState } from "react";
import { STORE_KEYS, type EventEntry } from "@/lib/mock/data";

// TODO: replace with GET /api/client/events
export function useEventItems(): EventEntry[] {
  const [items, setItems] = useState<EventEntry[]>([]);

  useEffect(() => {
    const stored: EventEntry[] = JSON.parse(
      localStorage.getItem(STORE_KEYS.eventItems) ?? "[]",
    );
    setItems(stored);
  }, []);

  return items;
}
