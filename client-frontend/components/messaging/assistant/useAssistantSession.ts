"use client";

import { useCallback, useState } from "react";
import { FAQ_VERSION } from "@/components/faq/faqContent";
import { START, choose, type Choice, type Session } from "./assistantFlow";

// Stored alongside the session: the transcript holds positional FAQ ids
// (t1q2), which point at different questions once the FAQ CSV changes.
interface Stored extends Session {
  faqVersion?: string;
}

// localStorage, not cookies: cookies cap at ~4KB and ride along on every
// request to the server, while this transcript is browser-only state.
// Keyed per user so accounts sharing a browser don't see each other's.
function storageKey(uid: string | null): string {
  return `help-assistant:${uid ?? "anonymous"}`;
}

function load(key: string): Session {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as Stored) : null;
    if (!parsed || !Array.isArray(parsed.log) || !parsed.stage) return START;
    if (parsed.faqVersion !== FAQ_VERSION) {
      // FAQ content changed since this was saved: drop the transcript, but a
      // client already handed to their RM stays in the RM room.
      return parsed.stage === "connected" ? { log: [], stage: "connected", topic: null } : START;
    }
    return { log: parsed.log, stage: parsed.stage, topic: parsed.topic };
  } catch {
    return START;
  }
}

function save(key: string, session: Session) {
  try {
    const stored: Stored = { ...session, faqVersion: FAQ_VERSION };
    window.localStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // Storage blocked (private mode etc.) — the session just won't persist.
  }
}

/**
 * The help assistant's session for this user, persisted in localStorage until
 * they start over. Only mounted client-side (inside the chat popup), so reading
 * storage in the initial state is safe.
 */
export function useAssistantSession(uid: string | null) {
  const key = storageKey(uid);
  const [session, setSession] = useState<Session>(() => load(key));

  const pick = useCallback(
    (choice: Choice): Session => {
      const next = choose(session, choice);
      setSession(next);
      save(key, next);
      return next;
    },
    [session, key],
  );

  const reset = useCallback(() => {
    setSession(START);
    save(key, START);
  }, [key]);

  return { session, pick, reset };
}
