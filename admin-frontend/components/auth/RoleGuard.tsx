"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: string[];
  /** Where to send users who lack the required role. Defaults to "/overview". */
  redirectTo?: string;
}

export function RoleGuard({
  children,
  allowedRoles,
  redirectTo = "/",
}: RoleGuardProps) {
  const { portalUser, loading, backendSyncing } = useAuth();
  const router = useRouter();

  const isLoading  = loading || backendSyncing;
  const hasAccess  = portalUser != null && allowedRoles.includes(portalUser.role);

  useEffect(() => {
    if (!isLoading && !hasAccess) {
      router.replace(redirectTo);
    }
  }, [isLoading, hasAccess, redirectTo, router]);

  if (isLoading || !hasAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="size-6 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
