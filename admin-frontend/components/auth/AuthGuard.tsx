"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, refreshPortalUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  // Grants are resolved fresh server-side on every login, but nothing else
  // in the app re-fetches them mid-session — a role's standing access or a
  // per-user override published elsewhere would otherwise never take effect
  // for an already-open tab. Refresh on every navigation instead.
  useEffect(() => {
    if (!loading && user) {
      void refreshPortalUser();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="size-6 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
