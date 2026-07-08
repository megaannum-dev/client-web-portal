"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { accessLevel, type AccessLevel, type PageId } from "@/lib/pages";

/**
 * Access level of the current user for one page.
 * - "OPERATE" — reach + trigger the page's own mutating actions.
 * - "VIEW"    — read-only; page must opt in to gate its own controls.
 * - null      — no grant (route guard already blocks reach; hook returns null defensively).
 */
export function usePageAccess(pageId: PageId): AccessLevel | null {
  const { portalUser } = useAuth();
  return portalUser ? accessLevel(portalUser.role, pageId) : null;
}
