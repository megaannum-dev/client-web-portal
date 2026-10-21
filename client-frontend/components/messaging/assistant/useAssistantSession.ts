"use client";

import { useCallback, useState } from "react";
import { START, choose, type Choice, type Session } from "./assistantFlow";

// localStorage, not cookies: cookies cap at ~4KB and ride along on every
// request to the server, while this transcript is browser-only state.
// Keyed per user so accounts sharing a browser don't see each other's.
function storageKey(uid: string | null): string {
  return `help-assistant:${uid ?? "anonymous"}`;
}

function load(key: string): Session {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as Session) : null;
    return parsed && Array.isArray(parsed.log) && parsed.stage ? parsed : START;
  } catch {
    return START;
  }
}

function save(key: string, session: Session) {
  try {
    window.localStorage.setItem(key, JSON.stringify(session));
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
