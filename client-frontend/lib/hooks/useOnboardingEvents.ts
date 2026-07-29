"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { fetchEvents, type ClientEventDTO } from "@/lib/api/onboarding";
import type { EventEntry, EventCategory, ActionLevel } from "@/types/portal";

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

/** The DTO carries no icon/level metadata (§1 seam gap) -- classify from the
 *  title text the backend already writes, following the same semantic
 *  pairings the original mock event catalog used (declined -> urgent shield,
 *  renewal/reminder -> urgent alarm-clock, approved/active/complete ->
 *  primary trending-up, submitted -> info file-text). */
function classify(title: string): { iconType: EventEntry["iconType"]; level: ActionLevel } {
  const t = title.toLowerCase();
  if (t.includes("declined") || t.includes("rejected")) return { iconType: "shield", level: "urgent" };
  if (t.includes("renewal") || t.includes("reminder") || t.includes("due")) {
    return { iconType: "alarm-clock", level: "urgent" };
  }
  if (t.includes("approved") || t.includes("active") || t.includes("complete")) {
    return { iconType: "trending-up", level: "primary" };
  }
  if (t.includes("submitted")) return { iconType: "file-text", level: "info" };
  return { iconType: "file-text", level: "info" };
}

function mapEvent(dto: ClientEventDTO): EventEntry {
  const category = FILTER_CATEGORIES.includes(dto.category as EventCategory)
    ? (dto.category as EventCategory)
    : "Others";
  const { iconType, level } = classify(dto.title);
  return {
    id: dto.id, iconType, level,
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
