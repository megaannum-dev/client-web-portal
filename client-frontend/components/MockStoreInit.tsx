"use client";

import { useEffect } from "react";
import {
  MOCK_KYC_STATUS,
  MOCK_LATEST_EVENTS,
  STORE_KEYS,
  type LatestEvent,
} from "@/lib/mock/data";

export function MockStoreInit() {
  useEffect(() => {
    if (!localStorage.getItem(STORE_KEYS.kycStatus)) {
      localStorage.setItem(STORE_KEYS.kycStatus, MOCK_KYC_STATUS);
    }
    // Always keep base seed events in sync; preserve user-added dynamic events on top.
    const baseIds = new Set(MOCK_LATEST_EVENTS.map((e) => e.id));
    const existing: LatestEvent[] = JSON.parse(
      localStorage.getItem(STORE_KEYS.latestEvents) ?? "[]",
    );
    const userAdded = existing.filter((e) => !baseIds.has(e.id));
    localStorage.setItem(
      STORE_KEYS.latestEvents,
      JSON.stringify([...userAdded, ...MOCK_LATEST_EVENTS]),
    );
    if (!localStorage.getItem(STORE_KEYS.allotmentRequests)) {
      localStorage.setItem(STORE_KEYS.allotmentRequests, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORE_KEYS.eventItems)) {
      localStorage.setItem(STORE_KEYS.eventItems, JSON.stringify([]));
    }
  }, []);

  return null;
}
