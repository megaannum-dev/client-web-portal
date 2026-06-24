"use client";

import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { postBackendLogin, postBackendLogout, postBackendRegister } from "@/lib/auth-api";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase";
import type { PortalUser } from "@/types/portal";

type AuthContextValue = {
  user: User | null;
  portalUser: PortalUser | null;
  loading: boolean;
  backendSyncing: boolean;
  backendSyncError: string | null;
  firebaseReady: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmailPassword: (email: string, password: string) => Promise<void>;
  signUpWithEmailPassword: (email: string, password: string, role?: string) => Promise<void>;
  /** Demo bypass: sets a fake session (no Firebase) so the workspaces load. */
  signInDemo: (name: string, role: PortalUser["role"]) => void;
  signOutUser: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  refreshPortalUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** localStorage key for the demo (auth-bypass) session. */
const DEMO_KEY = "megacrm_demo_user";

type DemoSession = { name: string; role: PortalUser["role"] };

function readDemoSession(): DemoSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DEMO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DemoSession>;
    if (parsed && typeof parsed.role === "string") {
      return { name: parsed.name ?? "Demo User", role: parsed.role as PortalUser["role"] };
    }
  } catch {
    /* ignore malformed session */
  }
  return null;
}

/** A minimal Firebase-User-shaped object good enough for the guards in demo mode. */
function makeDemoUser(name: string): User {
  return {
    uid: "demo",
    displayName: name,
    email: null,
    getIdToken: async () => "demo-token",
  } as unknown as User;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [portalUser, setPortalUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendSyncing, setBackendSyncing] = useState(false);
  const [backendSyncError, setBackendSyncError] = useState<string | null>(null);
  const firebaseReady = isFirebaseConfigured();
  const isRegistering = useRef(false);
  // True while a demo (auth-bypass) session is active. Logout must clear React
  // state directly for these, since no onAuthStateChanged listener is attached.
  const isDemo = useRef(false);

  useEffect(() => {
    // Demo bypass takes precedence: if a demo session exists, run on it and
    // skip Firebase entirely. Survives page refreshes.
    const demo = readDemoSession();
    if (demo) {
      isDemo.current = true;
      setUser(makeDemoUser(demo.name));
      setPortalUser({ id: 0, firebase_uid: "demo", email: null, role: demo.role });
      setLoading(false);
      return;
    }

    if (!firebaseReady) {
      setLoading(false);
      setUser(null);
      setPortalUser(null);
      return;
    }

    let cancelled = false;
    const auth = getFirebaseAuth();

    const unsub = onAuthStateChanged(auth, async (next) => {
      setUser(next);
      setPortalUser(null);
      setBackendSyncError(null);

      if (!next) {
        setBackendSyncing(false);
        setLoading(false);
        return;
      }

      // Registration is in progress — signUpWithEmailPassword owns portalUser state
      // for this cycle. Skip the login sync to prevent a competing MariaDB write.
      if (isRegistering.current) {
        setBackendSyncing(false);
        setLoading(false);
        return;
      }

      setBackendSyncing(true);
      try {
        const token = await next.getIdToken();
        const profile = await postBackendLogin(token);
        if (!cancelled) {
          setPortalUser(profile);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Could not sync with API";
          setBackendSyncError(msg);
          const unauthorized =
            /\b401\b/.test(msg) || /\b403\b/.test(msg) || /Unauthorized/i.test(msg);
          if (unauthorized) {
            try {
              await signOut(auth);
            } catch {
              /* noop */
            }
          }
        }
      } finally {
        if (!cancelled) {
          setBackendSyncing(false);
          setLoading(false);
        }
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [firebaseReady]);

  const signInWithGoogle = useCallback(async () => {
    if (!firebaseReady) return;
    const auth = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  }, [firebaseReady]);

  const signInWithEmailPassword = useCallback(async (email: string, password: string) => {
    if (!firebaseReady) return;
    const auth = getFirebaseAuth();
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, [firebaseReady]);

  const signUpWithEmailPassword = useCallback(async (email: string, password: string, role?: string) => {
    if (!firebaseReady) return;
    const auth = getFirebaseAuth();
    isRegistering.current = true;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const token = await cred.user.getIdToken();
      setBackendSyncing(true);
      const profile = await postBackendRegister(token, role);
      setPortalUser(profile);
    } catch (err) {
      // Firebase credential was created but backend registration failed.
      // Sign out to restore a clean unauthenticated state before surfacing the error.
      try { await signOut(auth); } catch { /* noop */ }
      throw err;
    } finally {
      isRegistering.current = false;
      setBackendSyncing(false);
      setLoading(false);
    }
  }, [firebaseReady]);

  const signInDemo = useCallback((name: string, role: PortalUser["role"]) => {
    const cleanName = name.trim() || "Demo User";
    try {
      window.localStorage.setItem(DEMO_KEY, JSON.stringify({ name: cleanName, role }));
    } catch {
      /* ignore storage failures — session still set in memory */
    }
    isDemo.current = true;
    setUser(makeDemoUser(cleanName));
    setPortalUser({ id: 0, firebase_uid: "demo", email: null, role });
    setBackendSyncError(null);
    setLoading(false);
  }, []);

  const signOutUser = useCallback(async () => {
    // Always clear any demo session first.
    try {
      window.localStorage.removeItem(DEMO_KEY);
    } catch {
      /* noop */
    }
    // Demo sessions have no Firebase listener, so reset React state directly
    // (and skip Firebase) regardless of whether Firebase is configured.
    if (isDemo.current || !firebaseReady) {
      isDemo.current = false;
      setUser(null);
      setPortalUser(null);
      return;
    }
    try {
      await postBackendLogout();
    } catch {
      /* non-blocking */
    }
    const auth = getFirebaseAuth();
    await signOut(auth);
  }, [firebaseReady]);

  const getIdToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  const refreshPortalUser = useCallback(async () => {
    if (!user) {
      setPortalUser(null);
      return;
    }
    setBackendSyncing(true);
    setBackendSyncError(null);
    try {
      const token = await user.getIdToken(true);
      const profile = await postBackendLogin(token);
      setPortalUser(profile);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not sync with API";
      setBackendSyncError(msg);
      const unauthorized =
        /\b401\b/.test(msg) || /\b403\b/.test(msg) || /Unauthorized/i.test(msg);
      if (unauthorized && firebaseReady) {
        try {
          await signOut(getFirebaseAuth());
        } catch {
          /* noop */
        }
      }
    } finally {
      setBackendSyncing(false);
    }
  }, [user, firebaseReady]);

  const value = useMemo(
    () => ({
      user,
      portalUser,
      loading,
      backendSyncing,
      backendSyncError,
      firebaseReady,
      signInWithGoogle,
      signInWithEmailPassword,
      signUpWithEmailPassword,
      signInDemo,
      signOutUser,
      getIdToken,
      refreshPortalUser,
    }),
    [
      user,
      portalUser,
      loading,
      backendSyncing,
      backendSyncError,
      firebaseReady,
      signInWithGoogle,
      signInWithEmailPassword,
      signUpWithEmailPassword,
      signInDemo,
      signOutUser,
      getIdToken,
      refreshPortalUser,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
