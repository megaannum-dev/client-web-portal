"use client";

import { useCallback, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import type { PortalUser } from "@/types/portal";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function Home() {
  const { user, loading, firebaseReady, signInWithGoogle, signOutUser, getIdToken } = useAuth();
  const [profile, setProfile] = useState<PortalUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setError(null);
    const headers: HeadersInit = { "Content-Type": "application/json" };
    const token = await getIdToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(`${apiBase}/api/users/me`, { headers });
    if (!res.ok) {
      const text = await res.text();
      setError(text || res.statusText);
      setProfile(null);
      return;
    }
    const data = (await res.json()) as PortalUser;
    setProfile(data);
  }, [getIdToken]);

  return (
    <main className="min-h-screen bg-corporate-muted/40">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
        <header className="rounded-2xl border border-corporate-muted bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand">Client portal</p>
          <h1 className="mt-2 text-3xl font-semibold text-corporate">Allotments & redemptions</h1>
          <p className="mt-3 text-corporate">
            Sign in with Firebase to access your profile from the API. This surface uses the corporate
            palette: orange accent, neutral gray typography, and soft gray panels.
          </p>
        </header>

        <section className="rounded-2xl border border-corporate-muted bg-white p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-corporate">Authentication</h2>
          {!firebaseReady && (
            <p className="mt-3 text-sm text-corporate">
              Set{" "}
              <code className="rounded bg-corporate-muted/60 px-1 py-0.5 text-xs">
                NEXT_PUBLIC_FIREBASE_* 
              </code>{" "}
              variables before building the image or running locally.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => signInWithGoogle()}
              disabled={!firebaseReady || loading}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Sign in with Google
            </button>
            <button
              type="button"
              onClick={() => signOutUser()}
              disabled={!user || loading}
              className="rounded-lg border border-corporate-muted px-4 py-2 text-sm font-semibold text-corporate transition hover:bg-corporate-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Sign out
            </button>
          </div>
          <p className="mt-3 text-sm text-corporate">
            {loading && "Checking session…"}
            {!loading && user && `Signed in as ${user.email ?? user.uid}`}
            {!loading && !user && firebaseReady && "No active session."}
          </p>
        </section>

        <section className="rounded-2xl border border-corporate-muted bg-white p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-corporate">API profile</h2>
          <p className="mt-2 text-sm text-corporate">
            Calls <code className="rounded bg-corporate-muted/60 px-1 py-0.5 text-xs">GET /api/users/me</code>
            . When the API runs with{" "}
            <code className="rounded bg-corporate-muted/60 px-1 py-0.5 text-xs">FIREBASE_AUTH_DISABLED=true</code>
            , a bearer token is optional for local smoke tests.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={loadProfile}
              className="rounded-lg bg-corporate px-4 py-2 text-sm font-semibold text-white shadow transition hover:opacity-90"
            >
              Load profile from API
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          {profile && (
            <pre className="mt-4 overflow-x-auto rounded-lg bg-corporate-muted/40 p-4 text-xs text-corporate">
              {JSON.stringify(profile, null, 2)}
            </pre>
          )}
        </section>
      </div>
    </main>
  );
}
