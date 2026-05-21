"use client";

import Link from "next/link";

import { useAuth } from "@/components/AuthProvider";

export default function Home() {
  const {
    user,
    portalUser,
    loading,
    backendSyncing,
    backendSyncError,
    firebaseReady,
    signOutUser,
  } = useAuth();

  const sessionReady = Boolean(user && portalUser);
  const profile = portalUser;

  return (
    <main className="min-h-screen bg-corporate-muted/40">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
        <header className="rounded-2xl border border-corporate-muted bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand">Admin portal</p>
          <h1 className="mt-2 text-3xl font-semibold text-corporate">Company Internal CRM</h1>
          <p className="mt-3 text-corporate">
            {sessionReady
              ? "You are signed in. Your profile and role are stored in the portal API."
              : "Sign in to use the portal. Authentication uses Firebase; the API stores your role and profile."}
          </p>
        </header>

        {!firebaseReady && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
            Add Firebase web config to <code className="text-xs">.env.local</code> (see{" "}
            <code className="text-xs">.env.example</code>).
          </section>
        )}

        {(loading || backendSyncing) && firebaseReady && (
          <section className="rounded-2xl border border-corporate-muted bg-white p-8 shadow-sm">
            <p className="text-sm text-corporate" aria-live="polite">
              {backendSyncing ? "Connecting to the portal API…" : "Checking session…"}
            </p>
          </section>
        )}

        {!loading && !backendSyncing && user && !portalUser && backendSyncError && (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-900">
            <p className="font-semibold">Could not sync with the portal API</p>
            <p className="mt-2">{backendSyncError}</p>
            <p className="mt-3 text-corporate">
              Make sure the API is running (e.g. <code className="text-xs">http://localhost:8000</code>) and{" "}
              <code className="text-xs">NEXT_PUBLIC_API_BASE_URL</code> in <code className="text-xs">.env.local</code>{" "}
              matches.
            </p>
            <Link href="/login" className="mt-4 inline-block font-semibold text-brand hover:underline">
              Back to sign in
            </Link>
          </section>
        )}

        {!loading && !backendSyncing && sessionReady && (
          <section className="rounded-2xl border border-corporate-muted bg-white p-8 shadow-sm">
            <h2 className="text-lg font-semibold text-corporate">Your account</h2>
            <p className="mt-2 text-sm text-corporate">
              Signed in as <span className="font-medium">{user?.email ?? user?.uid ?? "Unknown user"}</span>
            </p>
            <dl className="mt-6 grid gap-3 rounded-xl bg-corporate-muted/30 p-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-corporate">Portal role</dt>
                <dd className="font-medium text-corporate">{profile?.role ?? "UNKNOWN"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-corporate">Firebase UID</dt>
                <dd className="break-all font-mono text-xs text-corporate">{profile?.firebase_uid ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-corporate">Email on file</dt>
                <dd className="font-medium text-corporate">{profile?.email ?? "—"}</dd>
              </div>
            </dl>
            <div className="mt-8">
              <button
                type="button"
                onClick={() => signOutUser()}
                className="rounded-lg border border-corporate-muted px-4 py-2 text-sm font-semibold text-corporate transition hover:bg-corporate-muted/30"
              >
                Sign out
              </button>
            </div>
          </section>
        )}

        {!loading && !backendSyncing && !sessionReady && (
          <section className="rounded-2xl border border-corporate-muted bg-white p-8 shadow-sm">
            <h2 className="text-lg font-semibold text-corporate">Get started</h2>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground shadow hover:opacity-90"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-lg border border-corporate-muted px-5 py-2.5 text-sm font-semibold text-corporate hover:bg-corporate-muted/30"
              >
                Create account
              </Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}