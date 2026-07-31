"use client";

import Link from "next/link";
import { ShieldAlert } from "@/lib/icons";
import { useAuth } from "@/components/auth/AuthProvider";
import { PAGES, defaultPathFor, type PageId } from "@/lib/pages-config";

/** Renders — it does NOT redirect. A silent bounce from a URL a colleague just sent
 *  reads as a broken link and generates a support question; a named refusal answers it. */
export function NoAccess({ pageId }: { pageId: PageId }) {
  const { portalUser } = useAuth();
  const home = portalUser ? defaultPathFor(portalUser.role) : null;
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3.5 p-6 text-center">
      <ShieldAlert size={28} strokeWidth={1.75} className="text-secondary" />
      <h1 className="text-[20px] font-bold text-on-surface">{PAGES[pageId].label}</h1>
      <p className="max-w-[420px] text-[13px] leading-[1.5] text-secondary">
        You do not have access to this page. Ask an administrator if you need it.
      </p>
      {home && (
        <Link href={home} className="text-[13px] font-semibold text-primary hover:underline">
          Go to your default page
        </Link>
      )}
    </div>
  );
}
