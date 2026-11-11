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
import { listFailed, putFailed, removeFailed } from "@/lib/chat/failedStore";
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
  /** Re-send a failed message (it leaves the failed list; a new attempt starts). */
  retry: (tempId: string) => void;
  /** Delete a failed message for good. */
  discard: (tempId: string) => void;
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
  // Failed sends, by tempId, so Retry has the files. Mirrored in IndexedDB.
  const failedRef = useRef(new Map<string, { body: string; files: File[] }>());

  /** Our own message as a bubble, whether in flight or failed. */
  const ownBubble = useCallback(
    (tempId: string, body: string, files: File[], createdAt: string, status?: "failed"): ChatMessage => ({
      id: tempId,
      senderUid: ownUid ?? "self",
      senderName: portalUser?.name ?? null,
      role: "rm",
      body: body || null,
      // Shown as plain rows until the server names them; the real DTO
      // replaces this wholesale moments later.
      attachments: files.map((f, i) => ({
        id: `${tempId}:${i}`,
        name: f.name,
        kind: "file-check" as const,
        size: "",
      })),
      createdAt,
      own: true,
      ...(status && { status }),
    }),
    [ownUid, portalUser],
  );

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

  // Bring back this room's failed sends saved by an earlier visit or reload.
  useEffect(() => {
    failedRef.current = new Map();
    if (!ownUid) return;
    let stale = false;
    void listFailed(`${ownUid}:${clientId}`).then((recs) => {
      if (stale || !recs.length) return;
      for (const r of recs) failedRef.current.set(r.tempId, { body: r.body, files: r.files });
      setMessages((prev) =>
        [...prev, ...recs.map((r) => ownBubble(r.tempId, r.body, r.files, r.createdAt, "failed"))].sort(byCreatedAt),
      );
    });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, ownUid]);

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
      const optimistic = ownBubble(tempId, trimmed, files, new Date().toISOString());
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
        // Keep the bubble, marked failed, and save it so Retry/Delete still
        // work after a reload. No server copy is ever matched to it by text.
        // `error` stays for load failures only.
        pendingRef.current = pendingRef.current.filter((p) => p.tempId !== tempId);
        failedRef.current.set(tempId, { body: trimmed, files });
        if (ownUid) {
          void putFailed({ tempId, owner: `${ownUid}:${clientId}`, body: trimmed, files, createdAt: optimistic.createdAt });
        }
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: "failed" as const } : m)));
      } finally {
        sendInFlight.current = false;
        setSending(false);
      }
    },
    [clientId, merge, ownUid, ownBubble],
  );

  const discard = useCallback((tempId: string) => {
    failedRef.current.delete(tempId);
    void removeFailed(tempId);
    setMessages((prev) => prev.filter((m) => m.id !== tempId));
  }, []);

  const retry = useCallback(
    (tempId: string) => {
      const f = failedRef.current.get(tempId);
      if (!f || sendInFlight.current) return;
      discard(tempId);
      void send(f.body, f.files);
    },
    [discard, send],
  );

  return { days: groupByDay(messages), loading, error, sending, send, retry, discard };
}
