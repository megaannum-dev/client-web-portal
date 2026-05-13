"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Legacy route: the signed-in app lives at /. Redirect keeps bookmarks working.
 */
export default function DashboardRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-corporate-muted/40 px-4">
      <p className="text-sm text-corporate" aria-live="polite">
        Redirecting to home…
      </p>
    </main>
  );
}
