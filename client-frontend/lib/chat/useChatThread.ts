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
import { listFailed, putFailed, removeFailed } from "@/lib/chat/failedStore";
import type { ChatAttachment, ChatDay, ChatMessage } from "@/components/messaging/types";

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

const PAGE = 200;

function fmtTime(d: Date): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

// Shown as plain rows until the server names them; the real DTO replaces this.
function localAttachments(tempId: string, files: File[]): ChatAttachment[] {
  return files.map((f, i) => ({ id: `${tempId}:${i}`, name: f.name, kind: "file-check" as const, size: "" }));
}

export interface UseChatThread {
  days: ChatDay[];
  loading: boolean;
  /** Load errors only -- a failed send is a `status: "failed"` bubble instead. */
  error: string | null;
  sending: boolean;
  send: (body: string, files: File[]) => Promise<void>;
  retry: (tempId: string) => void;
  discard: (tempId: string) => void;
  /** The server has messages older than the oldest one loaded. */
  hasOlder: boolean;
  loadingOlder: boolean;
  loadOlder: () => Promise<void>;
}

export function useChatThread(): UseChatThread {
  const { user, getIdToken } = useAuth();
  const ownUid = user?.uid ?? null;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const olderInFlight = useRef(false);

  // Refs, not deps: AuthProvider memoises getIdToken, but a caller that did
  // not would otherwise re-run the load effect on every render forever.
  const getTokenRef = useRef(getIdToken);
  getTokenRef.current = getIdToken;

  const pendingRef = useRef<Pending[]>([]);
  // Newest confirmed timestamp, used as the `since` cursor on catch-up.
  const newestRef = useRef<string | null>(null);
  const loadInFlight = useRef(false);
  const sendInFlight = useRef(false);
  // Messages that never reached the backend, mirrored in IndexedDB (failedStore).
  const failedRef = useRef(new Map<string, { body: string; files: File[] }>());

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
        const dtos = await fetchMessages(token, { since, limit: PAGE });
        merge(dtos.map((d) => toViewMessage(d, ownUid)));
        if (!since) setHasOlder(dtos.length === PAGE);
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
        attachments: localAttachments(tempId, files),
        createdAt: now.toISOString(),
        own: true,
        time: fmtTime(now),
      };
      pendingRef.current.push({ tempId, body: trimmed || null, fileCount: files.length });
      setMessages((prev) => [...prev, optimistic].sort(byCreatedAt));

      setSending(true);
      try {
        const token = await getTokenRef.current();
        const dto = await sendMessage(token, { body: trimmed || null, files });
        merge([toViewMessage(dto, ownUid)]);
      } catch {
        // It never reached the backend: keep the bubble, marked failed, and
        // keep the content (in IndexedDB too, so it survives a reload) until
        // the user retries or deletes it. No pendingRef entry, so nothing can
        // retire it by a lookalike message.
        pendingRef.current = pendingRef.current.filter((p) => p.tempId !== tempId);
        failedRef.current.set(tempId, { body: trimmed, files });
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: "failed" as const } : m)));
        if (ownUid) void putFailed({ tempId, owner: ownUid, body: trimmed, files, createdAt: optimistic.createdAt });
      } finally {
        sendInFlight.current = false;
        setSending(false);
      }
    },
    [merge, ownUid, user],
  );

  // Next page back from the oldest CONFIRMED message (temp: bubbles have no server id).
  const loadOlder = useCallback(async () => {
    if (olderInFlight.current) return;
    const oldest = messagesRef.current.find((m) => !m.id.startsWith("temp:"));
    if (!oldest) return;
    olderInFlight.current = true;
    setLoadingOlder(true);
    try {
      const token = await getTokenRef.current();
      const dtos = await fetchMessages(token, { before: oldest.id, limit: PAGE });
      merge(dtos.map((d) => toViewMessage(d, ownUid)));
      setHasOlder(dtos.length === PAGE);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load earlier messages");
    } finally {
      olderInFlight.current = false;
      setLoadingOlder(false);
    }
  }, [merge, ownUid]);

  // Restore failed messages saved by an earlier visit.
  useEffect(() => {
    if (!ownUid) return;
    let alive = true;
    void listFailed(ownUid).then((recs) => {
      if (!alive || !recs.length) return;
      const bubbles = recs.map<ChatMessage>((r) => {
        failedRef.current.set(r.tempId, { body: r.body, files: r.files });
        return {
          id: r.tempId,
          senderUid: ownUid,
          senderName: user?.displayName ?? null,
          role: "client",
          body: r.body || null,
          attachments: localAttachments(r.tempId, r.files),
          createdAt: r.createdAt,
          own: true,
          time: fmtTime(new Date(r.createdAt)),
          status: "failed",
        };
      });
      setMessages((prev) => {
        const byId = new Map(prev.map((m) => [m.id, m]));
        for (const b of bubbles) byId.set(b.id, b);
        return Array.from(byId.values()).sort(byCreatedAt);
      });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownUid]);

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

  return { days: groupByDay(messages), loading, error, sending, send, retry, discard, hasOlder, loadingOlder, loadOlder };
}
