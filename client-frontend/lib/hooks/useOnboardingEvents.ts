"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { fetchEvents, type ClientEventDTO } from "@/lib/api/onboarding";
import type { EventEntry, EventCategory } from "@/lib/mock/data";

const FILTER_CATEGORIES: EventCategory[] = ["Market News", "Account Notification", "Requests Status", "Others"];

// ponytail: naive minute/hour/day relative-time bucket, not Intl.RelativeTimeFormat —
// upgrade if this needs i18n-localized strings.
function formatRelativeTime(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

/** Fixed chrome for a server-sourced event — the DTO carries no icon/level/action
 *  metadata (§1 seam gap), so every row gets the same "shield/info" treatment;
 *  category now comes from the real column, falling back to "Others" for any
 *  value outside the known filter set. */
function mapEvent(dto: ClientEventDTO): EventEntry {
  const category = FILTER_CATEGORIES.includes(dto.category as EventCategory)
    ? (dto.category as EventCategory)
    : "Others";
  return {
    id: dto.id, iconType: "shield", level: "info",
    title: dto.title, time: formatRelativeTime(dto.created_at), description: dto.body,
    category,
    primaryLabel: "Acknowledge", primaryVariant: "outline", secondaryLabel: "Mark as Read",
  };
}

export function useClientEvents(): EventEntry[] {
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
        if (!cancelled) setData([]);  // fail silent — page renders an empty feed
      }
    })();
    return () => { cancelled = true; };
  }, [getIdToken]);

  return data;
}
