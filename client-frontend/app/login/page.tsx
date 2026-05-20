"use client";

import Image from "next/image";
import { Building2, Eye, EyeClosed } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { formatFirebaseAuthError } from "@/lib/firebase-auth-errors";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/overview";

  const {
    user,
    portalUser,
    loading,
    backendSyncing,
    backendSyncError,
    firebaseReady,
    signInWithEmailPassword,
    signInWithGoogle,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const busy = loading || backendSyncing || submitting;

  useEffect(() => {
    if (!loading && !backendSyncing && user && portalUser) {
      router.replace(next);
    }
  }, [loading, backendSyncing, user, portalUser, next, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!email.trim() || !password) {
      setFormError("Please enter your email and password.");
      return;
    }
    setSubmitting(true);
    try {
      await signInWithEmailPassword(email, password);
    } catch (err) {
      setFormError(formatFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onGoogleLogin = async () => {
    setFormError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setFormError(formatFirebaseAuthError(err));
    }
  };

  return (
    <div className="flex flex-col items-center w-full max-w-[480px]">

      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        {/* <Image src="/favicon.png" alt="Megaannum" width={52} height={52} /> */}
        <div className="bg-primary rounded p-1">
          <Building2 size={25} strokeWidth={2} stroke="white"/>
        </div>
        <span className="text-[22px] font-extrabold tracking-[-0.033em] text-on-surface leading-[28px]">
            AlphaTrade  {/* Dummy logo name*/}
        </span>
      </div>

      <div className="w-full bg-surface-lowest border border-[#e0e0e0] rounded-lg shadow-[0px_0px_10px_rgba(0,0,0,0.15)] px-8 py-6 sm:px-9 sm:py-7 flex flex-col gap-5">
        {/* Heading */}
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-headline-lg font-semibold text-on-surface tracking-tight text-center">
            Welcome back
          </h1>
        </div>

        {/* Firebase not configured warning */}
        {!firebaseReady && (
          <p className="rounded bg-amber-50 border border-amber-200 px-4 py-3 text-body-sm text-amber-900">
            Set <code className="text-xs">NEXT_PUBLIC_FIREBASE_*</code> in{" "}
            <code className="text-xs">.env.local</code> to enable authentication.
          </p>
        )}

        {/* Error */}
        {(formError || (user && backendSyncError)) && (
          <p className="rounded bg-error-container border border-error/20 px-4 py-3 text-body-sm text-error">
            {formError ?? backendSyncError}
          </p>
        )}

        {/* Form */}
        <form className="flex flex-col gap-6" onSubmit={onSubmit} noValidate>

          {/* Email */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="email"
              className="text-label-md font-semibold tracking-[0.05em] uppercase text-on-surface"
            >
              Email Address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!firebaseReady || busy}
              className="w-full border border-[#e0e0e0] rounded px-4 py-2.5 text-body-md text-on-surface placeholder:text-secondary-fixed-dim bg-surface-lowest outline-none focus:border-outline transition-colors duration-150 disabled:opacity-50"
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="text-label-md font-semibold tracking-[0.05em] uppercase text-on-surface"
              >
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-label-md font-bold text-primary hover:opacity-80 transition-opacity"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!firebaseReady || busy}
                className="w-full border border-[#e0e0e0] rounded px-4 py-2.5 pr-12 text-body-md text-on-surface placeholder:text-secondary-fixed-dim bg-surface-lowest outline-none focus:border-outline transition-colors duration-150 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-secondary hover:text-on-surface transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <Eye width={22} height={16}/>
                ) : (
                  <EyeClosed width={22} height={16}/>
                )}
              </button>
            </div>
          </div>

          {/* Remember me */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="size-4 rounded-sm border border-[#e0e0e0] accent-primary cursor-pointer shrink-0"
            />
            <span className="text-body-sm text-secondary">Keep me signed in for 30 days</span>
          </label>

          {/* Submit */}
          <button
            type="submit"
            disabled={!firebaseReady || busy}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold text-body-md rounded py-3 shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Signing in…" : (
              <>
                Sign In
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 7H13M13 7L7 1M13 7L7 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative flex items-center gap-4">
          <div className="flex-1 h-px bg-[#e0e0e0]" />
          <span className="text-label-md text-secondary-fixed-dim tracking-[0.05em] uppercase">or</span>
          <div className="flex-1 h-px bg-[#e0e0e0]" />
        </div>

        {/* Google Login */}
        <button
          type="button"
          onClick={onGoogleLogin}
          disabled={!firebaseReady || busy}
          className="w-full flex items-center justify-center gap-2.5 border border-[#e0e0e0] rounded py-2.5 text-body-md font-bold text-secondary hover:bg-surface-container transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19.6 10.23c0-.68-.06-1.36-.18-2H10v3.77h5.39a4.6 4.6 0 0 1-2 3.02v2.51h3.23c1.89-1.74 2.98-4.3 2.98-7.3Z" fill="#4285F4"/>
            <path d="M10 20c2.7 0 4.96-.89 6.62-2.42l-3.23-2.51c-.9.6-2.04.96-3.39.96-2.6 0-4.8-1.76-5.59-4.12H1.07v2.6A10 10 0 0 0 10 20Z" fill="#34A853"/>
            <path d="M4.41 11.91A6.02 6.02 0 0 1 4.09 10c0-.66.11-1.3.32-1.91V5.49H1.07A10.02 10.02 0 0 0 0 10c0 1.61.39 3.14 1.07 4.51l3.34-2.6Z" fill="#FBBC05"/>
            <path d="M10 3.96c1.47 0 2.79.5 3.82 1.5L16.69 2.4A9.96 9.96 0 0 0 10 0 10 10 0 0 0 1.07 5.49l3.34 2.6C5.2 5.72 7.4 3.96 10 3.96Z" fill="#EA4335"/>
          </svg>
          Continue with Google account
        </button>

        {/* Footer */}
        <div className="pt-3 flex flex-col items-center gap-3">
          <p className="text-body-sm text-secondary text-center">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-bold text-primary hover:opacity-80 transition-opacity">
              Contact Administrator
            </Link>
          </p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-label-md font-semibold text-secondary tracking-[0.05em] hover:text-on-surface transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-label-md font-semibold text-secondary tracking-[0.05em] hover:text-on-surface transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>

      {/* Copyright */}
      <p className="mt-6 text-label-md text-secondary-fixed-dim tracking-[0.05em] text-center">
        © 2024 Megaannum Client Portal. Institutional Grade Data Management.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6 py-8 sm:py-10">
      <Suspense
        fallback={
          <div className="flex items-center justify-center">
            <div className="size-6 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
