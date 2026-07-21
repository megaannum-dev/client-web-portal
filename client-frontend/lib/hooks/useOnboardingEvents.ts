"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { fetchEvents, type ClientEventDTO } from "@/lib/api/onboarding";
import type { EventEntry } from "@/lib/mock/data";

/** Fixed chrome for a server-sourced onboarding event — the DTO carries no
 *  icon/level/action metadata (§1 seam gap), so every row gets the same
 *  "Account Notification"-style treatment the mock already uses for that
 *  category (see MOCK_EVENT_ITEMS's "event-kyc-reminder"/"event-security-alert"). */
function mapEvent(dto: ClientEventDTO): EventEntry {
  return {
    id: dto.id, iconType: "shield", level: "info",
    title: dto.title, time: dto.created_at, description: dto.body,
    category: "Account Notification",
    primaryLabel: "Acknowledge", primaryVariant: "outline", secondaryLabel: "Mark as Read",
  };
}

export function useOnboardingEvents() {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<EventEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken();
        const dtos = await fetchEvents(token);
        if (!cancelled) setData(dtos.map(mapEvent));
      } catch {
        if (!cancelled) setData([]);  // fail silent — the mock non-onboarding
                                       // items still render (see page.tsx)
      }
    })();
    return () => { cancelled = true; };
  }, [getIdToken]);

  return data;
}
