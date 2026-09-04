"use client";

// 021 U10 — one client's thread: history, live pushes, and sending.
//
// Every message that reaches the UI goes through `merge`, which is keyed by
// id. That single funnel is what makes the three overlapping sources safe:
//   * the REST fetch on open (and the `since` catch-up, whose cursor is
//     INCLUSIVE, so it always re-delivers the newest message),
//   * the 201 from our own POST,
//   * the WebSocket echo of that same POST -- the backend fans out to the
//     sender too, on purpose, so their other devices update.

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { fetchMessages, sendMessage, type NewMessageFrame } from "@/lib/api/chat";
import { groupByDay, toViewMessage } from "@/lib/chat/adapter";
import type { ChatDay, ChatMessage } from "@/components/rm/chat/types";

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

export function useChatThread({
  clientId,
  subscribe,
  socketOpen,
}: {
  clientId: string;
  subscribe: (handler: (frame: NewMessageFrame) => void) => () => void;
  socketOpen: boolean;
}): UseChatThread {
  const { getIdToken, portalUser } = useAuth();
  const ownUid = portalUser?.firebase_uid ?? null;

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
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const msg of incoming) {
        byId.set(msg.id, msg);
        if (!newestRef.current || msg.createdAt > newestRef.current) newestRef.current = msg.createdAt;
        // Retire the optimistic twin. Matching on body+file-count rather than
        // id because the echo can beat our own 201 back to this tab, so the
        // real id may arrive before we have been told what it is.
        if (msg.own) {
          const i = pendingRef.current.findIndex(
            (p) => p.body === msg.body && p.fileCount === msg.attachments.length,
          );
          if (i !== -1) {
            const [done] = pendingRef.current.splice(i, 1);
            byId.delete(done.tempId);
          }
        }
      }
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
        const dtos = await fetchMessages(token, { clientId, since, limit: 200 });
        merge(dtos.map((d) => toViewMessage(d, ownUid)));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load this conversation");
      } finally {
        loadInFlight.current = false;
        setLoading(false);
      }
    },
    [clientId, merge, ownUid],
  );

  // Open the thread: always fetch first, before trusting the socket.
  useEffect(() => {
    newestRef.current = null;
    pendingRef.current = [];
    setMessages([]);
    setLoading(true);
    void load(null);
  }, [load]);

  // Catch up whatever the socket missed while it was down.
  useEffect(() => {
    if (socketOpen && newestRef.current) void load(newestRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socketOpen]);

  // Live pushes. One socket serves every thread, so filter on client_id.
  useEffect(
    () =>
      subscribe((frame) => {
        if (frame.client_id !== clientId) return;
        merge([toViewMessage(frame.message, ownUid)]);
      }),
    [subscribe, clientId, merge, ownUid],
  );

  const send = useCallback(
    async (body: string, files: File[]) => {
      const trimmed = body.trim();
      if (!trimmed && !files.length) return;
      if (sendInFlight.current) return; // guard a double-fired Enter
      sendInFlight.current = true;

      const tempId = `temp:${
        globalThis.crypto?.randomUUID?.() ?? String(Math.random()).slice(2)
      }`;
      const optimistic: ChatMessage = {
        id: tempId,
        senderUid: ownUid ?? "self",
        senderName: portalUser?.name ?? null,
        role: "rm",
        body: trimmed || null,
        // Shown as plain rows until the server names them; the real DTO
        // replaces this wholesale moments later.
        attachments: files.map((f, i) => ({
          id: `${tempId}:${i}`,
          name: f.name,
          kind: "file-check" as const,
          size: "",
        })),
        createdAt: new Date().toISOString(),
        own: true,
      };
      pendingRef.current.push({
        tempId,
        body: trimmed || null,
        fileCount: files.length,
      });
      setMessages((prev) => [...prev, optimistic].sort(byCreatedAt));

      setSending(true);
      try {
        const token = await getTokenRef.current();
        const dto = await sendMessage(token, { clientId, body: trimmed || null, files });
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
    [clientId, merge, ownUid, portalUser],
  );

  return { days: groupByDay(messages), loading, error, sending, send };
}
