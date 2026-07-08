"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { defaultPathFor } from "@/lib/pages";

export default function RootPage() {
  const { user, portalUser, loading, backendSyncing } = useAuth();
  const router = useRouter();

  const isLoading   = loading || backendSyncing;
  const destination = portalUser?.role ? defaultPathFor(portalUser.role) : null;

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace("/login"); return; }
    if (destination) { router.replace(destination); }
  }, [isLoading, user, destination, router]);

  if (isLoading || destination) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="size-6 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />
      </div>
    );
  }

  // Authenticated user whose role has no pages configured yet.
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <p className="text-body-sm text-secondary">
        No pages are configured for your role yet.
      </p>
    </div>
  );
}
