"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { formatFirebaseAuthError, getFirebaseAuthErrorCode } from "@/lib/firebase-auth-errors";

export default function RegisterPage() {
  const router = useRouter();
  const {
    user,
    portalUser,
    loading,
    backendSyncing,
    backendSyncError,
    firebaseReady,
    signUpWithEmailPassword,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formErrorCode, setFormErrorCode] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !backendSyncing && user && portalUser) {
      router.replace("/");
    }
  }, [loading, backendSyncing, user, portalUser, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormErrorCode(null);
    if (!email.trim() || password.length < 6) {
      setFormError("Use a valid email and a password of at least 6 characters.");
      return;
    }
    try {
      await signUpWithEmailPassword(email, password);
    } catch (err) {
      setFormErrorCode(getFirebaseAuthErrorCode(err));
      setFormError(formatFirebaseAuthError(err));
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-corporate-muted/40 px-4 py-12">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-corporate-muted bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-corporate">Create account</h1>
        <p className="mt-2 text-sm text-corporate">Email and password are stored by Firebase.</p>

        {!firebaseReady && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Configure Firebase in <code className="text-xs">.env.local</code> first.
          </p>
        )}

        {(formError || (user && backendSyncError)) && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            <p>{formError ?? backendSyncError}</p>
            {formErrorCode === "auth/email-already-in-use" && (
              <p className="mt-2 font-medium">
                <Link href="/login" className="text-brand underline">
                  Go to sign in →
                </Link>
              </p>
            )}
          </div>
        )}

        <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
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
              autoComplete="new-password"
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
            {backendSyncing ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-corporate">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
