"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { formatFirebaseAuthError } from "@/lib/firebase-auth-errors";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const {
    user,
    portalUser,
    loading,
    backendSyncing,
    backendSyncError,
    firebaseReady,
    signInWithGoogle,
    signInWithEmailPassword,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !backendSyncing && user && portalUser) {
      router.replace(next);
    }
  }, [loading, backendSyncing, user, portalUser, next, router]);

  const onEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!email.trim() || !password) {
      setFormError("Enter email and password.");
      return;
    }
    try {
      await signInWithEmailPassword(email, password);
    } catch (err) {
      setFormError(formatFirebaseAuthError(err));
    }
  };

  const onGoogle = async () => {
    setFormError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setFormError(formatFirebaseAuthError(err));
    }
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-corporate-muted bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold text-corporate">Sign in</h1>
      <p className="mt-2 text-sm text-corporate">Use your portal credentials or Google.</p>

      {!firebaseReady && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Set <code className="text-xs">NEXT_PUBLIC_FIREBASE_*</code> in{" "}
          <code className="text-xs">.env.local</code> to enable authentication.
        </p>
      )}

      {(formError || (user && backendSyncError)) && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{formError ?? backendSyncError}</p>
      )}

      <form className="mt-6 flex flex-col gap-4" onSubmit={onEmailSubmit}>
        <label className="block text-sm font-medium text-corporate">
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-corporate-muted px-3 py-2 text-corporate outline-none ring-brand focus:ring-2"
            disabled={!firebaseReady || loading || backendSyncing}
          />
        </label>
        <label className="block text-sm font-medium text-corporate">
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-corporate-muted px-3 py-2 text-corporate outline-none ring-brand focus:ring-2"
            disabled={!firebaseReady || loading || backendSyncing}
          />
        </label>
        <button
          type="submit"
          disabled={!firebaseReady || loading || backendSyncing}
          className="rounded-lg bg-brand py-2.5 text-sm font-semibold text-brand-foreground shadow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {backendSyncing ? "Signing in…" : "Sign in with email"}
        </button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-corporate-muted" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-corporate">Or</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onGoogle}
        disabled={!firebaseReady || loading || backendSyncing}
        className="w-full rounded-lg border border-corporate-muted py-2.5 text-sm font-semibold text-corporate transition hover:bg-corporate-muted/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Continue with Google
      </button>

      <p className="mt-6 text-center text-sm text-corporate">
        No account?{" "}
        <Link href="/register" className="font-semibold text-brand hover:underline">
          Create one
        </Link>
      </p>
      <p className="mt-3 text-center text-sm">
        <Link href="/" className="text-corporate hover:text-brand">
          ← Back to home
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-corporate-muted/40 px-4 py-12">
      <Suspense
        fallback={
          <div className="text-sm text-corporate" aria-live="polite">
            Loading…
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
