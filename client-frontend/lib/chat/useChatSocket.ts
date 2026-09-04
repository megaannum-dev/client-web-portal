"use client";

// 021 U7 — the chat WebSocket, opened once per session.
//
// The socket is keyed server-side by firebase_uid, not by thread, so ONE
// connection carries frames for every room the signed-in user sits in.
// Consumers filter on frame.client_id; they must not open a socket per thread.
//
// Push-only by design (realtime.py park()): nothing is ever sent
// client -> server. Sending a message is always the HTTP POST.

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { chatSocketUrl, mintWsTicket, type NewMessageFrame } from "@/lib/api/chat";

export type ChatSocketStatus = "idle" | "connecting" | "open" | "reconnecting" | "lost";

// Backoff ladder, then hold at the last rung. The server hard-closes every
// socket at CHAT_WS_MAX_LIFETIME (3600s default), so reconnecting is routine,
// not an error path -- the backend's own comment budgets for it.
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];
// Consecutive failures before the UI stops calling this transient. A disallowed
// Origin or a wrong NEXT_PUBLIC_API_BASE_URL closes with 1008 and looks exactly
// like a blip, so without this it would retry silently forever and say nothing.
const LOST_AFTER = 3;

export interface UseChatSocketOptions {
  /** Gate the connection. The entry point flips this to true. */
  enabled: boolean;
  /** Every new_message frame, for EVERY thread this user is in. */
  onFrame: (frame: NewMessageFrame) => void;
  /** Fired each time the socket opens, including reconnects, so the consumer
   *  can run its `since` catch-up. A missed push costs latency, never data. */
  onOpen?: () => void;
}

export function useChatSocket({ enabled, onFrame, onOpen }: UseChatSocketOptions): {
  status: ChatSocketStatus;
} {
  const { getIdToken } = useAuth();
  const [status, setStatus] = useState<ChatSocketStatus>("idle");

  // Callbacks live in refs so a re-render with a new closure never tears down a
  // healthy socket -- only `enabled` or a change of user may do that.
  // getIdToken too: AuthProvider memoises it, but a caller that does not
  // would otherwise reconnect the socket on every single render.
  const getTokenRef = useRef(getIdToken);
  getTokenRef.current = getIdToken;
  const onFrameRef = useRef(onFrame);
  const onOpenRef = useRef(onOpen);
  onFrameRef.current = onFrame;
  onOpenRef.current = onOpen;

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      return;
    }

    // The whole lifecycle lives in this closure. connect and scheduleRetry call
    // each other, so hoisting them into useCallback would make a dependency
    // cycle whose two halves can drift a render apart.
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let disposed = false;

    const scheduleRetry = () => {
      if (disposed) return; // never reconnect a torn-down hook
      const n = attempts;
      attempts = n + 1;
      setStatus(attempts >= LOST_AFTER ? "lost" : "reconnecting");
      const delay = BACKOFF_MS[Math.min(n, BACKOFF_MS.length - 1)];
      // Jitter so many tabs waking together do not stampede the API.
      timer = setTimeout(connect, delay * (0.75 + Math.random() * 0.5));
    };

    async function connect(): Promise<void> {
      if (disposed) return;
      setStatus((s) => (s === "open" ? s : attempts === 0 ? "connecting" : s));
      try {
        const token = await getTokenRef.current();
        if (!token) throw new Error("Not signed in");
        // A fresh ticket EVERY attempt: they are single-use and die in 30s, so
        // a retry must never replay the one that just failed.
        const { ticket } = await mintWsTicket(token);
        if (disposed) return;

        const ws = new WebSocket(chatSocketUrl(ticket));
        socket = ws;

        ws.onopen = () => {
          if (disposed) return;
          attempts = 0;
          setStatus("open");
          onOpenRef.current?.();
        };
        ws.onmessage = (ev: MessageEvent) => {
          try {
            const frame = JSON.parse(String(ev.data)) as NewMessageFrame;
            if (frame?.type === "new_message") onFrameRef.current(frame);
          } catch {
            /* an unparseable frame is not worth tearing the socket down for */
          }
        };
        // No onerror branch: a failed socket always closes too, and handling
        // both would double-schedule the retry.
        ws.onclose = () => {
          socket = null;
          scheduleRetry();
        };
      } catch {
        scheduleRetry();
      }
    }

    void connect();

    return () => {
      // Order matters: mark disposed BEFORE closing, or our own onclose
      // schedules a reconnect for a hook that is going away.
      disposed = true;
      if (timer) clearTimeout(timer);
      socket?.close();
      socket = null;
      setStatus("idle");
    };
  }, [enabled]);

  return { status };
}
