"use client";

import { useEffect } from "react";
import {
  MOCK_KYC_STATUS,
  MOCK_LATEST_EVENTS,
  STORE_KEYS,
} from "@/lib/mock/data";

export function MockStoreInit() {
  useEffect(() => {
    if (!localStorage.getItem(STORE_KEYS.kycStatus)) {
      localStorage.setItem(STORE_KEYS.kycStatus, MOCK_KYC_STATUS);
    }
    if (!localStorage.getItem(STORE_KEYS.latestEvents)) {
      localStorage.setItem(STORE_KEYS.latestEvents, JSON.stringify(MOCK_LATEST_EVENTS));
    } else {
      // Patch href onto existing events that are missing it (schema migration)
      const hrefMap: Record<string, string> = Object.fromEntries(
        MOCK_LATEST_EVENTS.filter((e) => e.href).map((e) => [e.id, e.href!]),
      );
      const stored = JSON.parse(localStorage.getItem(STORE_KEYS.latestEvents)!);
      const patched = stored.map((e: { id: string; href?: string }) =>
        hrefMap[e.id] && !e.href ? { ...e, href: hrefMap[e.id] } : e,
      );
      localStorage.setItem(STORE_KEYS.latestEvents, JSON.stringify(patched));
    }
    if (!localStorage.getItem(STORE_KEYS.allotmentRequests)) {
      localStorage.setItem(STORE_KEYS.allotmentRequests, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORE_KEYS.eventItems)) {
      localStorage.setItem(STORE_KEYS.eventItems, JSON.stringify([]));
    }
  }, []);

  return null;
}
