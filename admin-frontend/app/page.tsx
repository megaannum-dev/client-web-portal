"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { defaultPathFor } from "@/lib/pages-config";

// Firebase SDK's own IndexedDB caches — dropped whenever we bounce an
// authenticated-but-destination-less session back to login (stale token, or
// a role with no pages configured), so a fresh sign-in isn't poisoned by them.
const STALE_FIREBASE_DBS = ["firebase-heartbeat-database", "firebaseLocalStorageDb"];

function clearStaleFirebaseCache() {
  if (typeof indexedDB === "undefined") return;
  for (const name of STALE_FIREBASE_DBS) {
    indexedDB.deleteDatabase(name);
  }
}

export default function RootPage() {
  const { user, portalUser, loading, backendSyncing } = useAuth();
  const router = useRouter();

  const isLoading   = loading || backendSyncing;
  const destination = portalUser?.role ? defaultPathFor(portalUser.role) : null;

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace("/login"); return; }
    if (destination) { router.replace(destination); return; }
    // Authenticated but no destination — a stale Firebase token or a role
    // with no pages configured land here the same way. Neither is fixable by
    // staying on this screen, so clear the cache and send them back to login.
    clearStaleFirebaseCache();
    router.replace("/login");
  }, [isLoading, user, destination, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="size-6 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />
    </div>
  );
}
