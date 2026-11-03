import type { ChatMessage } from "./types";

// Slack for clock skew between this browser and the server's timestamps.
const SKEW_MS = 5000;

/**
 * Whether an RM-room message should pop in: only what arrives while the room
 * is open, never the history it opened with.
 *   - Own messages animate as the optimistic `temp:` bubble, at the moment of
 *     sending. Its confirmed twin replaces it under a new id (a fresh mount),
 *     and must not pop a second time.
 *   - Others' messages animate when created after the room mounted.
 */
export function isNewMessage(m: ChatMessage, mountedAt: number): boolean {
  if (m.own) return m.id.startsWith("temp:");
  return Date.parse(m.createdAt) > mountedAt - SKEW_MS;
}

/** The send/receive pop for a chat bubble row, or "" when it shouldn't animate. */
export function bubbleInClass(animate: boolean, own: boolean): string {
  if (!animate) return "";
  return own ? "animate-bubble-in-own" : "animate-bubble-in-other";
}
