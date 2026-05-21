/**
 * Write utilities for the mock localStorage store.
 *
 * Migration guide: replace each function body with the equivalent API call.
 * The call-sites (hooks and UI) don't need to change.
 */

import {
  STORE_KEYS,
  type AllotmentRequest,
  type EventEntry,
  type LatestEvent,
} from "./data";

// ── ID generation ──────────────────────────────────────────────────────────────

export function generateRequestId(): string {
  const n = parseInt(localStorage.getItem(STORE_KEYS.requestCounter) ?? "800", 10) + 1;
  localStorage.setItem(STORE_KEYS.requestCounter, String(n));
  return `#AT-${n}`;
}

export function generateRedemptionId(): string {
  const n = parseInt(localStorage.getItem(STORE_KEYS.redemptionCounter) ?? "429", 10) + 1;
  localStorage.setItem(STORE_KEYS.redemptionCounter, String(n));
  return `#RR-${n}`;
}

// ── Individual appenders ───────────────────────────────────────────────────────

export function appendAllotmentRequest(req: AllotmentRequest): void {
  const existing: AllotmentRequest[] = JSON.parse(
    localStorage.getItem(STORE_KEYS.allotmentRequests) ?? "[]",
  );
  localStorage.setItem(STORE_KEYS.allotmentRequests, JSON.stringify([req, ...existing]));
}

export function appendLatestEvent(event: LatestEvent): void {
  const existing: LatestEvent[] = JSON.parse(
    localStorage.getItem(STORE_KEYS.latestEvents) ?? "[]",
  );
  localStorage.setItem(STORE_KEYS.latestEvents, JSON.stringify([event, ...existing]));
}

export function appendEventItem(item: EventEntry): void {
  const existing: EventEntry[] = JSON.parse(
    localStorage.getItem(STORE_KEYS.eventItems) ?? "[]",
  );
  localStorage.setItem(STORE_KEYS.eventItems, JSON.stringify([item, ...existing]));
}

// ── Composite: submit a full allotment request ─────────────────────────────────
// TODO: replace with POST /api/client/allotment-requests

export function submitAllotmentRequest(params: {
  model: string;
  amount: string;
}) {
  const id   = generateRequestId();
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

  appendAllotmentRequest({
    id,
    type:   "Allotment",
    model:  params.model,
    amount: params.amount,
    date,
    status: "Processing",
  });

  appendLatestEvent({
    id:          `pending-${id}`,
    level:       "caution",
    title:       "Allotment Request Submitted",
    description: `Your allotment request (${id}) for ${params.amount} in ${params.model} is pending review.`,
  });

  appendEventItem({
    id:             `event-${id}`,
    iconType:       "briefcase",
    level:          "caution",
    title:          `Allotment Request — ${params.model}`,
    time:           "Just now",
    description:    `Your allotment request (${id}) for ${params.amount} has been submitted and is now pending advisor review.`,
    category:       "Requests",
    primaryLabel:   "View Details",
    primaryVariant: "outline",
    secondaryLabel: "Mark as Read",
  });

  return id;
}

// ── Composite: submit a full redemption request ────────────────────────────────
// TODO: replace with POST /api/client/redemptions

export function submitRedemptionRequest(params: {
  model: string;
  amount: string;
  redeemAll: boolean;
}) {
  const id   = generateRedemptionId();
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

  appendAllotmentRequest({
    id,
    type:   "Redemption",
    model:  params.model,
    amount: params.amount,
    date,
    status: "Processing",
  });

  appendLatestEvent({
    id:          `pending-${id}`,
    level:       "caution",
    title:       "Redemption Request Submitted",
    description: `Your redemption request (${id}) for ${params.amount} from ${params.model} is pending review.`,
  });

  appendEventItem({
    id:             `event-${id}`,
    iconType:       "trending-up",
    level:          "caution",
    title:          `Redemption Request — ${params.model}`,
    time:           "Just now",
    description:    `Your redemption request (${id}) for ${params.amount} has been submitted and is now pending advisor review.`,
    category:       "Requests",
    primaryLabel:   "View Details",
    primaryVariant: "outline",
    secondaryLabel: "Mark as Read",
  });

  return id;
}
