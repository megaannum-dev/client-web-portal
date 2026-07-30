"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import type { AccessLevel, PageId } from "@/lib/pages-config";

/**
 * The current user's effective access to one page, as resolved by the backend
 * (unexpired override, else the role's standing level) and delivered on `UserOut.grants`.
 * - "EDIT" — may use the page's mutating controls.
 * - "VIEW" — read-only; the page's mutating controls are disabled.
 * - "NONE" — no grant: absent from the sidebar, and direct arrival renders <NoAccess>.
 * Default-deny: no user, no grant map, or an absent key all resolve to "NONE".
 */
export function usePageAccess(pageId: PageId): AccessLevel {
  const { portalUser } = useAuth();
  return portalUser?.grants?.[pageId] ?? "NONE";
}

/** `usePageAccess(id) === "EDIT"`, named once so 32 call sites cannot typo the comparison. */
export function useCanEdit(pageId: PageId): boolean {
  return usePageAccess(pageId) === "EDIT";
}
