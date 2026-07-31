"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { NoAccess } from "@/components/auth/NoAccess";
import { PAGES, pageIdForPath, type PageId } from "@/lib/pages-config";

interface RoleGuardProps {
  children: React.ReactNode;
  /** The namespace this layout owns, e.g. "/rm". The guard asks "do I hold any grant under
   *  this prefix" — replacing `allowedRoles`, which is unanswerable in the browser: grants
   *  live in the DB, so the frontend knows only its OWN user's grants, never another
   *  role's, and any client-computed allowedRoles would be a guess. */
  prefix: string;
  /** Where to send users who hold no grant anywhere under `prefix`. Defaults to "/". */
  redirectTo?: string;
}

export function RoleGuard({
  children,
  prefix,
  redirectTo = "/",
}: RoleGuardProps) {
  const { portalUser, loading, backendSyncing } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isLoading = loading || backendSyncing;

  const pageId = pageIdForPath(pathname);
  const grants = portalUser?.grants;
  // Step 3: does the resolved page (if any) have a grant?
  const noGrantOnPage = pageId != null && grants?.[pageId] == null;
  // Step 4: does the user hold a grant on ANY page under this namespace?
  const noGrantUnderPrefix = (Object.keys(PAGES) as PageId[])
    .filter((id) => PAGES[id].path.startsWith(prefix))
    .every((id) => grants?.[id] == null);

  const shouldRedirect =
    !isLoading && (portalUser == null || (!noGrantOnPage && noGrantUnderPrefix));

  useEffect(() => {
    if (shouldRedirect) {
      router.replace(redirectTo);
    }
  }, [shouldRedirect, redirectTo, router]);

  if (isLoading || portalUser == null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="size-6 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />
      </div>
    );
  }

  if (noGrantOnPage) {
    return <NoAccess pageId={pageId as PageId} />;
  }

  if (noGrantUnderPrefix) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="size-6 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
