"use client";

import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { postBackendLogin, postBackendLogout, postBackendRegister } from "@/lib/auth-api";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase";
import { writeIdTokenCookie } from "@/lib/id-token";
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
  signOutUser: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  refreshPortalUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [portalUser, setPortalUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendSyncing, setBackendSyncing] = useState(false);
  const [backendSyncError, setBackendSyncError] = useState<string | null>(null);
  const firebaseReady = isFirebaseConfigured();
  const isRegistering = useRef(false);

  useEffect(() => {
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

  // Mirror the Firebase ID token into a non-httpOnly SameSite=Strict cookie
  // so the server-only apiClient can attach it as a Bearer token.
  useEffect(() => {
    if (!firebaseReady) return;
    const auth = getFirebaseAuth();
    const unsub = onIdTokenChanged(auth, async (fbUser) => {
      if (fbUser) {
        const token = await fbUser.getIdToken();
        writeIdTokenCookie(token);
      } else {
        writeIdTokenCookie("");
      }
    });
    return () => unsub();
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

  const signOutUser = useCallback(async () => {
    if (!firebaseReady) return;
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
