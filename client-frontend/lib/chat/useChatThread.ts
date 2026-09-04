"use client";

// 021 U9 — the client's own thread: history, live pushes, and sending.
//
// Twin of admin-frontend/lib/chat/useChatThread.ts. Two differences, both
// forced by the portal: this side never names a thread (the backend defaults
// client_id to the caller, since users.id is never on the client wire), and
// `own` is matched against the Firebase user's uid directly.
//
// Every message that reaches the UI goes through `merge`, keyed by id. That
// single funnel is what makes the three overlapping sources safe:
//   * the REST fetch on open (and the `since` catch-up, whose cursor is
//     INCLUSIVE, so it always re-delivers the newest message),
//   * the 201 from our own POST,
//   * the WebSocket echo of that same POST -- the backend fans out to the
//     sender too, on purpose, so their other devices update.

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { fetchMessages, sendMessage, type NewMessageFrame } from "@/lib/api/chat";
import { useChatSocket } from "@/lib/chat/useChatSocket";
import { groupByDay, toViewMessage } from "@/lib/chat/adapter";
import type { ChatDay, ChatMessage } from "@/components/messaging/types";

/** An optimistic message we have shown but the server has not confirmed. */
interface Pending {
  tempId: string;
  body: string | null;
  fileCount: number;
}

function byCreatedAt(a: ChatMessage, b: ChatMessage): number {
  const d = a.createdAt.localeCompare(b.createdAt);
  return d !== 0 ? d : a.id.localeCompare(b.id);
}

export interface UseChatThread {
  days: ChatDay[];
  loading: boolean;
  error: string | null;
  sending: boolean;
  send: (body: string, files: File[]) => Promise<void>;
}

export function useChatThread(): UseChatThread {
  const { user, getIdToken } = useAuth();
  const ownUid = user?.uid ?? null;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Refs, not deps: AuthProvider memoises getIdToken, but a caller that did
  // not would otherwise re-run the load effect on every render forever.
  const getTokenRef = useRef(getIdToken);
  getTokenRef.current = getIdToken;

  const pendingRef = useRef<Pending[]>([]);
  // Newest confirmed timestamp, used as the `since` cursor on catch-up.
  const newestRef = useRef<string | null>(null);
  const loadInFlight = useRef(false);
  const sendInFlight = useRef(false);

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;

    // Bookkeeping happens HERE, not inside the setMessages updater. React
    // double-invokes updaters under StrictMode (on by default in Next 14) to
    // surface impure ones: an updater that spliced pendingRef would, on its
    // second run, find the entry already gone, skip the delete, and strand the
    // optimistic bubble next to its confirmed twin -- a duplicate that only a
    // reload cleared. The updater below is now a pure function of `prev`.
    const retired: string[] = [];
    for (const msg of incoming) {
      if (!newestRef.current || msg.createdAt > newestRef.current) newestRef.current = msg.createdAt;
      // Matched on body+file-count rather than id because the echo can beat our
      // own 201 back to this tab, so the real id may arrive before we know it.
      if (!msg.own) continue;
      const i = pendingRef.current.findIndex(
        (p) => p.body === msg.body && p.fileCount === msg.attachments.length,
      );
      if (i !== -1) retired.push(pendingRef.current.splice(i, 1)[0].tempId);
    }

    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const tempId of retired) byId.delete(tempId);
      for (const msg of incoming) byId.set(msg.id, msg);
      return Array.from(byId.values()).sort(byCreatedAt);
    });
  }, []);

  /** The REST read. Runs on open AND on every socket open -- the diagram's
   *  guarantee is that a closed socket costs latency, never data. */
  const load = useCallback(
    async (since: string | null) => {
      if (loadInFlight.current) return;
      loadInFlight.current = true;
      try {
        const token = await getTokenRef.current();
        const dtos = await fetchMessages(token, { since, limit: 200 });
        merge(dtos.map((d) => toViewMessage(d, ownUid)));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load this conversation");
      } finally {
        loadInFlight.current = false;
        setLoading(false);
      }
    },
    [merge, ownUid],
  );

  const onFrame = useCallback(
    (frame: NewMessageFrame) => merge([toViewMessage(frame.message, ownUid)]),
    [merge, ownUid],
  );
  // Catch up whatever the socket missed while it was down. Fired on every
  // open, reconnects included.
  const onOpen = useCallback(() => {
    if (newestRef.current) void load(newestRef.current);
  }, [load]);

  // The page IS the room here, so mounting is the entry point.
  useChatSocket({ enabled: true, onFrame, onOpen });

  // Open the thread: always fetch first, before trusting the socket.
  useEffect(() => {
    void load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useCallback(
    async (body: string, files: File[]) => {
      const trimmed = body.trim();
      if (!trimmed && !files.length) return;
      if (sendInFlight.current) return; // guard a double-fired Enter
      sendInFlight.current = true;

      const tempId = `temp:${
        globalThis.crypto?.randomUUID?.() ?? String(Math.random()).slice(2)
      }`;
      const now = new Date();
      const optimistic: ChatMessage = {
        id: tempId,
        senderUid: ownUid ?? "self",
        senderName: user?.displayName ?? null,
        role: "client",
        body: trimmed || null,
        // Shown as plain rows until the server names them; the real DTO
        // replaces this wholesale moments later.
        attachments: files.map((f, i) => ({
          id: `${tempId}:${i}`,
          name: f.name,
          kind: "file-check" as const,
          size: "",
        })),
        createdAt: now.toISOString(),
        own: true,
        time: new Intl.DateTimeFormat(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(now),
      };
      pendingRef.current.push({ tempId, body: trimmed || null, fileCount: files.length });
      setMessages((prev) => [...prev, optimistic].sort(byCreatedAt));

      setSending(true);
      try {
        const token = await getTokenRef.current();
        const dto = await sendMessage(token, { body: trimmed || null, files });
        merge([toViewMessage(dto, ownUid)]);
      } catch (e) {
        // Drop the optimistic bubble and surface why, rather than leaving a
        // message on screen that no one will ever receive.
        pendingRef.current = pendingRef.current.filter((p) => p.tempId !== tempId);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setError(e instanceof Error ? e.message : "Message not sent");
      } finally {
        sendInFlight.current = false;
        setSending(false);
      }
    },
    [merge, ownUid, user],
  );

  return { days: groupByDay(messages), loading, error, sending, send };
}
