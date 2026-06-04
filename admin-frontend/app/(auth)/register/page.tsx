"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { formatFirebaseAuthError, getFirebaseAuthErrorCode } from "@/lib/firebase-auth-errors";

const ROLES = [
  { value: "ADMIN",      label: "Admin"                },
  { value: "MOBO",       label: "MOBO"                 },
  { value: "RM",         label: "Relationship Manager" },
  { value: "PM",         label: "Portfolio Manager"    },
  { value: "PC",         label: "Portfolio Controller" },
  { value: "COMPLIANCE", label: "Compliance Officer"   },
] as const;

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

  const [email,         setEmail        ] = useState("");
  const [password,      setPassword     ] = useState("");
  const [role,          setRole         ] = useState<string>("MOBO");
  const [formError,     setFormError    ] = useState<string | null>(null);
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
      await signUpWithEmailPassword(email, password, role);
    } catch (err) {
      setFormErrorCode(getFirebaseAuthErrorCode(err));
      setFormError(formatFirebaseAuthError(err));
    }
  };

  const disabled = !firebaseReady || loading || backendSyncing;

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
              disabled={disabled}
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
              disabled={disabled}
            />
          </label>
          <label className="block text-sm font-medium text-corporate">
            Role
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 w-full rounded-lg border border-corporate-muted bg-white px-3 py-2 text-corporate outline-none ring-brand focus:ring-2"
              disabled={disabled}
            >
              {ROLES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={disabled}
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
